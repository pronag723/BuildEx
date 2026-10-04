export default {
  discord: {
    label: "Discord",
    placeholder: "username или https://discord.gg/abc123",
    hint: "Ваш ник в Discord или ссылка-приглашение на ваш сервер.",
  },
  telegram: {
    label: "Telegram",
    placeholder: "@username",
    hint: "Ваш @username или ссылка t.me на профиль.",
  },
  youtube: {
    label: "YouTube",
    placeholder: "@channel",
    hint: "@-имя вашего канала или ссылка на youtube.com.",
  },
  twitch: {
    label: "Twitch",
    placeholder: "channel",
    hint: "Название вашего канала на Twitch.",
  },
  tiktok: {
    label: "TikTok",
    placeholder: "@username",
    hint: "Ваш @username в TikTok.",
  },
  instagram: {
    label: "Instagram",
    placeholder: "@username",
    hint: "Ваш @username в Instagram.",
  },
  x: {
    label: "X / Twitter",
    placeholder: "@username",
    hint: "Ваш @username в X.",
  },
  other: {
    label: "Сайт",
    placeholder: "https://example.com",
    hint: "Любая другая страница для клиентов. Должна начинаться с https://.",
  },
  errors: {
    pick: "Выберите, где клиенты могут с вами связаться.",
    tooLong: "Не длиннее {max} символов.",
    httpsOnly: "Введите полную ссылку, начинающуюся с https:// — другие ссылки не принимаются.",
    notAtHandle: "Не похоже на @username или ссылку для {platform}.",
    notHandle: "Не похоже на имя пользователя или ссылку для {platform}.",
  },
};
