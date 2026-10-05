# Korea Visa Status Monitor

БНСУ-ын албан ёсны Visa Portal-оос визийн төлөвийг өдөр бүр шалгаж, Telegram-аар мэдэгдэнэ.

## Ажиллах хуваарь

- Өдөр бүр 08:00 — Asia/Ulaanbaatar (`00:00 UTC`)
- GitHub Actions дотроос `Run workflow` дарж гараар ажиллуулж болно.

## GitHub Secrets

Repository → **Settings → Secrets and variables → Actions → New repository secret** хэсэгт дараах 3 secret үүсгэнэ.

### `VISA_APPLICANTS_JSON`

Паспорт дээрх мэдээллийг дараах бүтэцтэй JSON болгон оруулна:

```json
[
  {
    "label": "Applicant 1",
    "passport": "PASSPORT_NUMBER",
    "name": "SURNAME GIVENNAME",
    "dob": "YYYYMMDD"
  },
  {
    "label": "Applicant 2",
    "passport": "PASSPORT_NUMBER",
    "name": "SURNAME GIVENNAME",
    "dob": "YYYYMMDD"
  }
]
```

### `TELEGRAM_BOT_TOKEN`

Telegram дахь `@BotFather`-аас авсан bot token.

### `TELEGRAM_CHAT_ID`

Мэдэгдэл хүлээн авах Telegram хэрэглэгч эсвэл group-ийн chat ID.

## Анхны туршилт

1. Гурван secret-ээ тохируулна.
2. Repository-ийн **Actions** хэсэгт орно.
3. **Check Korea visa status** → **Run workflow** сонгоно.
4. Telegram-д хоёр хүний төлөв ирснийг шалгана.

## Нууцлал

- Паспортын мэдээлэл repository-ийн кодонд хадгалагдахгүй.
- GitHub Secrets-ийн утга workflow log-д хэвлэгдэхгүй.
- Telegram мэдэгдэлд паспортын дугаар болон төрсөн огноо орохгүй.
