import { chromium } from "playwright";

const VISA_URL = "https://www.visa.go.kr/openPage.do?MENU_ID=10301";
const REQUIRED_ENV = [
  "VISA_APPLICANTS_JSON",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
];

const statusTranslations = [
  [/심사\s*중|UNDER REVIEW/i, "Хянан шалгаж байна"],
  [/허가|APPROVED|GRANTED/i, "Зөвшөөрөгдсөн"],
  [/불허|DENIED|REJECTED/i, "Татгалзсан"],
  [/접수|RECEIVED/i, "Хүсэлт хүлээн авсан"],
  [/발급|ISSUED/i, "Виз олгосон"],
  [/반려|RETURNED/i, "Буцаасан"],
];

function requireEnvironment() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing GitHub Secrets: ${missing.join(", ")}`);
  }
}

function getApplicants() {
  let applicants;
  try {
    applicants = JSON.parse(process.env.VISA_APPLICANTS_JSON);
  } catch {
    throw new Error("VISA_APPLICANTS_JSON must be valid JSON.");
  }

  if (!Array.isArray(applicants) || applicants.length === 0) {
    throw new Error("VISA_APPLICANTS_JSON must contain at least one applicant.");
  }

  for (const [index, applicant] of applicants.entries()) {
    for (const field of ["label", "passport", "name", "dob"]) {
      if (!applicant?.[field]) {
        throw new Error(`Applicant ${index + 1} is missing '${field}'.`);
      }
    }
    if (!/^\d{8}$/.test(String(applicant.dob))) {
      throw new Error(`Applicant ${index + 1} dob must use YYYYMMDD.`);
    }
  }
  return applicants;
}

function translateStatus(rawStatus) {
  const normalized = rawStatus.replace(/\s+/g, " ").trim();
  const found = statusTranslations.find(([pattern]) => pattern.test(normalized));
  return found ? found[1] : normalized || "Төлөв тодорхойгүй";
}

async function checkApplicant(browser, applicant) {
  const page = await browser.newPage({
    locale: "ko-KR",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });

  try {
    await page.goto(VISA_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await page.locator("#RADIOSEARCH03").check();
    await page.locator("#sBUSI_GBNO").fill(String(applicant.passport).trim());
    await page.locator("#sEK_NM").fill(String(applicant.name).trim().toUpperCase());
    await page.locator("#sFROMDATE").fill(String(applicant.dob));
    await page.locator("#searchBtn").click();

    const result = page.locator("#result0_1");
    await result.waitFor({ state: "visible", timeout: 30_000 });

    const rows = result.locator("table tr");
    const rowCount = await rows.count();
    let applicationNumber = "";
    let purpose = "";
    let rawStatus = "";

    for (let i = 0; i < rowCount; i += 1) {
      const cells = (await rows.nth(i).locator("th, td").allTextContents())
        .map((value) => value.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      for (let j = 0; j < cells.length - 1; j += 1) {
        if (/신청번호|접수번호/.test(cells[j])) applicationNumber = cells[j + 1];
        if (/입국목적|체류자격/.test(cells[j])) purpose = cells[j + 1];
        if (/진행상태/.test(cells[j])) rawStatus = cells[j + 1];
      }
    }

    if (!rawStatus) {
      const resultText = (await result.innerText()).replace(/\s+/g, " ").trim();
      const knownStatus = statusTranslations.find(([pattern]) => pattern.test(resultText));
      rawStatus = knownStatus ? resultText.match(knownStatus[0])?.[0] ?? "" : "";
    }

    if (!rawStatus) {
      throw new Error("Status was not found in the result table.");
    }

    return {
      label: applicant.label,
      status: translateStatus(rawStatus),
      rawStatus: rawStatus.replace(/\s+/g, " ").trim(),
      purpose,
      applicationNumber,
    };
  } finally {
    await page.close();
  }
}

async function sendTelegram(text) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API returned ${response.status}: ${body.slice(0, 300)}`);
  }
}

function localTimestamp() {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function successMessage(results) {
  const lines = ["🇰🇷 БНСУ-ын визийн төлөв", `🕗 ${localTimestamp()}`];
  for (const result of results) {
    lines.push("", `👤 ${result.label}`, `Төлөв: ${result.status} (${result.rawStatus})`);
    if (result.purpose) lines.push(`Зорилго: ${result.purpose}`);
  }
  lines.push("", "Эх сурвалж: Korea Visa Portal");
  return lines.join("\n");
}

async function main() {
  requireEnvironment();
  const applicants = getApplicants();
  const browser = await chromium.launch({ headless: true });

  try {
    const results = [];
    for (const applicant of applicants) {
      results.push(await checkApplicant(browser, applicant));
    }
    await sendTelegram(successMessage(results));
    console.log("Visa statuses checked and Telegram notification sent.");
  } catch (error) {
    const message =
      `⚠️ Визийн статус шалгалт амжилтгүй\n` +
      `🕗 ${localTimestamp()}\n\n${error instanceof Error ? error.message : String(error)}`;
    try {
      await sendTelegram(message);
    } catch (telegramError) {
      console.error("Could not send failure notification:", telegramError);
    }
    throw error;
  } finally {
    await browser.close();
  }
}

await main();
