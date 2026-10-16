/*
Created at: 2026-10-11 02:18
Updated at: 2026-10-11 12:31
Description: Privacy, terms, help, and about page copy for GozilaSim ID in each supported language.
*/

// ###############################################
// Imports
// ###############################################

import type { SupportedLanguage } from "./i18n";

// ###############################################
// Types
// ###############################################

export type LegalRoute = "privacy" | "terms" | "help" | "about";

// A string is a paragraph; an array of strings is a bullet list.
export type LegalBlock = string | string[];

export type LegalLink = { label: string; path: string };

export type LegalSection = {
  title: string;
  blocks: LegalBlock[];
  links?: LegalLink[];
};

export type LegalDocument = {
  tab: string;
  label: string;
  headline: string;
  body: string;
  // Dated documents show the "last updated" line under the introduction.
  dated?: boolean;
  sections: LegalSection[];
};

export type LegalCopy = {
  navLabel: string;
  introduction: string;
  onThisPage: string;
  lastUpdated: string;
  contactByEmail: string;
  contactFallback: string;
  documents: Record<LegalRoute, LegalDocument>;
};

export const LEGAL_ROUTES: LegalRoute[] = ["privacy", "terms", "help", "about"];

// ###############################################
// Publishing Details
// ###############################################

// Change this date whenever the privacy policy or the terms are edited.
export const LEGAL_LAST_UPDATED = "2026-10-11";

// The address people should write to. While it is empty the pages say "contact the GozilaSim team" instead.
export const LEGAL_CONTACT_EMAIL = "";

// The copy below quotes these backend settings. Update the text if any of them changes:
//   SESSION_TTL_MINUTES=10080 (7 days), SESSION_COOKIE_SECURE=true, PASSWORD_RESET_TOKEN_TTL_MINUTES=30, PASSWORD_MIN_LENGTH=8,
//   AVATAR_MAX_BYTES=5 MB, OIDC code lifetime 5 minutes, OIDC access token lifetime 60 minutes,
//   AUTH_MAX_FAILED_ATTEMPTS=5, AUTH_LOCKOUT_MINUTES=15, and the security activity list limit of 50 events.
//   Recovery: 10 backup codes, and emailed one-time codes that last 10 minutes.
//   Apps: first-time consent per app. Deleting an account is immediate and asks for email, password, and a code.
// The copy also assumes email is on (PASSWORD_RESET_DELIVERY=email with SMTP configured).

// Text may contain "{contact}", which becomes the email phrase or the fallback phrase.
export function fillLegalContact(text: string, copy: LegalCopy) {
  const contact = LEGAL_CONTACT_EMAIL ? copy.contactByEmail.replace("{email}", LEGAL_CONTACT_EMAIL) : copy.contactFallback;
  return text.split("{contact}").join(contact);
}

// ###############################################
// English
// ###############################################

// The table of contents is built from `sections`, so every entry always has a matching heading.
const en: LegalCopy = {
  navLabel: "Legal and help pages",
  introduction: "Introduction",
  onThisPage: "On this page",
  lastUpdated: "Last updated {date}",
  contactByEmail: "email {email}",
  contactFallback: "contact the GozilaSim team",
  documents: {
    privacy: {
      tab: "Privacy",
      label: "Privacy policy",
      headline: "When you use GozilaSim ID, you trust us with your information.",
      body: "This policy explains what GozilaSim ID collects, why it collects it, who it is shared with, and the choices you have. It describes how the service works today.",
      dated: true,
      sections: [
        {
          title: "Information we collect",
          blocks: [
            "We collect only what is needed to give you one account for the apps connected to GozilaSim ID.",
            [
              "Account details: your email address, your display name, and your password. Your password is kept only as a one-way hash, never in readable form.",
              "Profile details you choose to add: first and last name, phone number, gender, date of birth, language, time zone, and profile picture. All of these are optional.",
              "Sign-in protection: the setup key that links your authenticator app to your account, so your 6-digit codes can be checked.",
              "Recovery details, if you add them: a recovery email address, and backup codes, which are kept only as one-way hashes.",
              "Sessions and devices: for each sign-in we record the IP address, the browser and device it came from, when it started, and when it was last active.",
              "Security activity: a record of events such as sign-ins, sign-outs, password changes, profile changes, and changes to extra verification, with the time, IP address, and device.",
              "Connected apps: when you allow an app to use your account, we record which app it was, what you agreed to let it see, when you agreed, and when it was last used."
            ],
            "GozilaSim ID does not use advertising or analytics trackers, and it does not build an advertising profile of you."
          ]
        },
        {
          title: "Why we collect it",
          blocks: [
            [
              "To create your account and sign you in.",
              "To protect your account: checking verification codes, showing you where your account is signed in, and helping you spot activity you do not recognize.",
              "To show your name and picture in GozilaSim ID and in the apps you sign in to.",
              "To share the details an app asks for when you choose to continue to it.",
              "To show dates and times in your language and time zone.",
              "To send you emails about your account: password reset links, and an alert when a browser you have not used before signs in."
            ],
            "We do not sell your information, and we do not use it for advertising."
          ]
        },
        {
          title: "Cookies and browser storage",
          blocks: [
            "GozilaSim ID sets one cookie: the sign-in cookie that keeps you signed in. Scripts on the page cannot read it, it is sent only over a secure connection, and it expires after 7 days unless you sign out sooner.",
            "Your browser also keeps a few preferences on your device: your theme, your sign-in page background, your language, and, only if you tick “Remember my email”, the email address you last signed in with. These stay in your browser."
          ]
        },
        {
          title: "Your privacy controls",
          blocks: [
            [
              "Personal info: add, change, or clear your name, phone number, gender, birthday, language, and time zone at any time.",
              "Profile picture: change or remove your picture, and permanently delete earlier pictures.",
              "Security and sign-in: change your password, turn extra verification on or off, set up backup codes and a recovery email, see every device that is signed in, and sign out any of them.",
              "Security activity: review recent events on your account.",
              "Connected apps: the first time an app asks to use your account, you see its name and what it wants to see, and it gets nothing until you agree. You can review these apps and remove any app's access at any time.",
              "Data and privacy: download a copy of your data, or delete your account."
            ]
          ],
          links: [
            { label: "Personal info", path: "/profile" },
            { label: "Security and sign-in", path: "/security" },
            { label: "Connected apps", path: "/connected-apps" },
            { label: "Data and privacy", path: "/data-privacy" }
          ]
        },
        {
          title: "Sharing your information",
          blocks: [
            "We share your information only in these cases.",
            [
              "With apps you sign in to. An app always receives your account ID and whether extra verification is on. Depending on what it asks for, it can also receive your email address; your profile details (display name, first and last name, profile picture, gender, date of birth, language, and time zone); and your phone number.",
              "With our image host. Profile pictures are stored and resized by Cloudinary.",
              "With the email service that delivers our messages to you. It receives your email address and the content of the message.",
              "When the law requires it."
            ],
            "Each connected app handles what it receives under its own privacy policy."
          ]
        },
        {
          title: "Keeping your information secure",
          blocks: [
            [
              "Passwords are stored as bcrypt hashes, so nobody at GozilaSim can read yours.",
              "Extra verification with an authenticator app is set up when you create your account.",
              "After 5 wrong passwords or codes in a row, sign-in is locked for 15 minutes, so nobody can keep guessing.",
              "You get an email when a browser you have not used before signs in to your account.",
              "Sign-in sessions and the access given to apps are stored as hashes rather than in readable form.",
              "Apps connect through OpenID Connect with PKCE, and only apps registered with GozilaSim ID can ask you to sign in.",
              "Resetting your password signs you out everywhere and withdraws the access already given to apps."
            ],
            "No system is perfectly secure. If you see activity you do not recognize, change your password and sign out your other devices right away."
          ],
          links: [
            { label: "Review security activity", path: "/security?section=activity" },
            { label: "Review signed-in devices", path: "/security?section=sessions" }
          ]
        },
        {
          title: "Exporting and deleting your information",
          blocks: [
            "You can see all of your profile information in Personal info and clear any optional detail there. You can remove your profile picture, and permanently delete earlier pictures, which also removes them from our image host.",
            "In Data and privacy you can download a copy of your data as one JSON file. It holds your profile, your signed-in devices, your security activity, and your connected apps. It never holds your password or any other secret.",
            "You can also delete your account there. To confirm, you enter your email address, your password, and a verification code. Deletion happens right away and cannot be undone: your profile, your pictures, your sessions, your security activity, and every app's access are removed. Apps you signed in to keep whatever they stored themselves, so ask each of them to delete it."
          ],
          links: [{ label: "Data and privacy", path: "/data-privacy" }]
        },
        {
          title: "How long we keep information",
          blocks: [
            [
              "Account and profile details are kept for as long as your account exists, and are removed right away when you delete it.",
              "The record of an app you allowed is kept until you remove that app's access or delete your account.",
              "A sign-in session ends when you sign out, when you sign it out from another device, or when it expires after 7 days.",
              "Security activity is kept with your account. The account page shows your 50 most recent events.",
              "Earlier profile pictures are kept until you delete them.",
              "Password reset links work once and expire after 30 minutes. One-time codes we email you expire after 10 minutes. The one-time code passed to an app when you sign in expires after 5 minutes, and the access it gives the app expires after 60 minutes."
            ]
          ]
        },
        {
          title: "Changes to this policy",
          blocks: [
            "When this policy changes, the date at the top of this page is updated, and significant changes are described here."
          ]
        },
        {
          title: "Contact",
          blocks: ["For questions about this policy or about your information, {contact}."]
        }
      ]
    },
    terms: {
      tab: "Terms",
      label: "Terms of service",
      headline: "These terms explain what you can expect from GozilaSim ID, and what we expect from you.",
      body: "By creating an account, or by signing in to an app with GozilaSim ID, you agree to these terms.",
      dated: true,
      sections: [
        {
          title: "The service",
          blocks: [
            "GozilaSim ID gives you one account for the apps connected to it. You can manage your profile, protect your sign-in, review your devices and activity, and open connected apps from one place."
          ]
        },
        {
          title: "Your account",
          blocks: [
            [
              "Give accurate information when you create your account, and keep access to your email address. It is how you sign in and how you recover access.",
              "Your account is for you alone. Do not share your password or your verification codes.",
              "You are responsible for what happens under your account. If you think someone else has used it, change your password and sign out your other devices."
            ]
          ],
          links: [{ label: "Security and sign-in", path: "/security" }]
        },
        {
          title: "Keeping access to your account",
          blocks: [
            "Extra verification uses an authenticator app on your phone. If you lose that app, your password alone is not enough to get back in.",
            "Set up backup codes and a recovery email so you can still sign in without the app. If you have neither, there is no self-service way to recover the account.",
            "When you change phones, set up the authenticator app on the new one before you erase or give away the old one."
          ]
        },
        {
          title: "Connected apps",
          blocks: [
            "The first time you sign in to an app with GozilaSim ID, you are asked whether the app may see the account details it requests. If you agree, we tell that app who you are and share those details. Later sign-ins to the same app are not asked again, until you remove its access in Connected apps.",
            "Each connected app is run under its own terms and privacy policy, and is responsible for how it uses what it receives. GozilaSim ID is not responsible for the content or behavior of connected apps."
          ]
        },
        {
          title: "What you may not do",
          blocks: [
            [
              "Access, or try to access, an account that is not yours.",
              "Probe, overload, or disrupt the service, or try to get around its security.",
              "Use automated means to create accounts or to guess passwords or verification codes.",
              "Pretend to be someone else, or use profile details or pictures you have no right to use.",
              "Use the service to break the law."
            ]
          ]
        },
        {
          title: "Your content",
          blocks: [
            "Your profile details and pictures remain yours. You give GozilaSim ID permission to store them, and to show them in the account center and in the apps you sign in to, only in order to run the service.",
            "Profile pictures must be PNG, JPG, WebP, or GIF images of up to 5 MB."
          ]
        },
        {
          title: "Suspending or closing an account",
          blocks: [
            "We may suspend or close an account that breaks these terms, or that puts the service or other people at risk.",
            "You can stop using GozilaSim ID at any time, and you can delete your account yourself in Data and privacy. Deletion is immediate and cannot be undone."
          ]
        },
        {
          title: "Availability and changes to the service",
          blocks: [
            "GozilaSim ID is under active development. Features may change, be added, or be removed, and the service may be unavailable from time to time.",
            "The service is provided as it is. To the extent the law allows, we do not promise that it will always be available or free of errors."
          ]
        },
        {
          title: "Changes to these terms",
          blocks: [
            "When these terms change, the date at the top of this page is updated. If you keep using GozilaSim ID after a change, the updated terms apply to you."
          ]
        },
        {
          title: "Contact",
          blocks: ["For questions about these terms, {contact}."]
        }
      ]
    },
    help: {
      tab: "Help",
      label: "Help",
      headline: "Find help for signing in, your profile, your password, and connected apps.",
      body: "Pick a topic. Each one tells you what to do and where to find it in your account.",
      sections: [
        {
          title: "Get started",
          blocks: [
            [
              "Create an account with your email address, a display name, and a password of at least 8 characters.",
              "Set up extra verification: scan the QR code with an authenticator app such as Google Authenticator or Microsoft Authenticator, then enter the 6-digit code it shows.",
              "Add your profile details when you are asked. You can skip any of them, or close the prompt and finish later."
            ]
          ]
        },
        {
          title: "Sign-in problems",
          blocks: [
            [
              "Wrong email or password: check for typing mistakes, then use “Forgot password?” on the sign-in page.",
              "Verification code not accepted: codes change every 30 seconds, so enter the one showing now, and check that your phone sets its clock automatically.",
              "Lost your authenticator app: on the verification step choose “Try another way”, then use a backup code or a code sent to your recovery email. If you set up neither, {contact}.",
              "Too many attempts: after 5 wrong passwords or codes in a row, sign-in is locked for 15 minutes. Wait until the time shown, or reset your password.",
              "Signed out unexpectedly: a sign-in lasts 7 days, and resetting your password signs out every device."
            ]
          ],
          links: [{ label: "Reset your password", path: "/forgot-password" }]
        },
        {
          title: "Update your profile",
          blocks: [
            "Open Personal info to change your name, gender, phone number, birthday, language, or time zone. Your email address is what you sign in with, and it cannot be changed there. Select it to verify it with a code we email you.",
            "To change your picture, select it on the home page or choose “Change profile picture” in the account menu. You can upload a PNG, JPG, WebP, or GIF of up to 5 MB, remove your picture, or bring back an earlier one."
          ],
          links: [{ label: "Personal info", path: "/profile" }]
        },
        {
          title: "Password help",
          blocks: [
            [
              "To change it, open Security and sign-in, choose Password, and enter your current password and a new one.",
              "If you forgot it, ask for a reset link from the sign-in page. We email it to you. The link works once and expires after 30 minutes.",
              "If extra verification is on, you also need a current code from your authenticator app to finish a reset.",
              "After a reset, every device is signed out, and the access previously given to connected apps is withdrawn."
            ]
          ],
          links: [{ label: "Change your password", path: "/security?section=password" }]
        },
        {
          title: "Extra verification",
          blocks: [
            "Extra verification asks for a 6-digit code from your authenticator app when you sign in, so a stolen password is not enough to get into your account.",
            [
              "To turn it on, open Security and sign-in, choose Extra verification, then scan the QR code or type the setup key into your authenticator app.",
              "To turn it off, confirm with your password and a current code.",
              "Changing phones? Set up the authenticator app on the new phone before you erase the old one.",
              "So you are never locked out, generate backup codes and add a recovery email. Backup codes are shown once, so save them somewhere safe."
            ]
          ],
          links: [
            { label: "Extra verification settings", path: "/security?section=verification" },
            { label: "Backup codes", path: "/security?section=backup-codes" },
            { label: "Recovery email", path: "/security?section=recovery-email" }
          ]
        },
        {
          title: "Devices and activity",
          blocks: [
            "Active sessions lists every browser and device signed in to your account, and when each was last active. You can sign out any one of them, or all of the others at once.",
            "Security activity shows recent events such as sign-ins, password changes, and profile changes. If something there was not you, change your password and sign out your other devices.",
            "When a browser you have not used before signs in, we send you an email with the device, time, and IP address.",
            "The security checkup at the top of Security and sign-in gathers the things worth a look in one list: extra verification, your recovery options, your sign-in email, new devices, and apps you no longer use."
          ],
          links: [
            { label: "Active sessions", path: "/security?section=sessions" },
            { label: "Security activity", path: "/security?section=activity" }
          ]
        },
        {
          title: "Connected apps",
          blocks: [
            "Apps that use GozilaSim ID send you here to sign in. The first time, you see the name of the app and what it will be able to see, and you choose whether to continue. After that, signing in to the same app takes you straight to it.",
            "Open Connected apps to see every app that can use your account, what each one can see, and when it was last used. Select Remove access to cut an app off. The next time you use that app, it asks you to sign in and agree again.",
            "To open an app connected to your account, use the apps menu, the grid icon at the top of the page."
          ],
          links: [{ label: "Connected apps", path: "/connected-apps" }]
        },
        {
          title: "Language and appearance",
          blocks: [
            "Open the account menu to switch language or change the appearance. Your language is saved to your account. Themes and the sign-in page background are saved only in the browser you are using."
          ]
        },
        {
          title: "Your data and deleting your account",
          blocks: [
            "Open Data and privacy to see what your account holds and to download it as a JSON file.",
            [
              "Download your data: select Download your data. The file holds your profile, devices, security activity, and connected apps, and never your password.",
              "Delete your account: select Delete your account, then confirm with your email address, your password, and a verification code. The account is deleted right away and cannot be brought back.",
              "Before you delete: download your data if you want a copy, and remember that apps you signed in to keep what they stored themselves."
            ]
          ],
          links: [{ label: "Data and privacy", path: "/data-privacy" }]
        },
        {
          title: "Contact support",
          blocks: ["If you cannot find what you need here, {contact}."]
        }
      ]
    },
    about: {
      tab: "About",
      label: "About GozilaSim ID",
      headline: "GozilaSim ID is the account center for your profile and secure access.",
      body: "One account signs you in to every app connected to GozilaSim ID, and gives you one place to manage your details and keep that account safe.",
      sections: [
        {
          title: "One account for your apps",
          blocks: [
            "Apps connect to GozilaSim ID through OpenID Connect, an open standard for signing in. You sign in once here, and each app receives only the details it asks for."
          ]
        },
        {
          title: "Account center",
          blocks: [
            "Home shows the state of your account at a glance: a security checkup with anything that needs attention, how many devices are signed in, and when you last signed in. From there you can reach Personal info, Security and sign-in, Data and privacy, and Connected apps."
          ],
          links: [{ label: "Go to your account", path: "/account" }]
        },
        {
          title: "Security and sign-in",
          blocks: [
            [
              "Passwords are stored as one-way hashes.",
              "Extra verification works with any standard authenticator app.",
              "Backup codes and a recovery email keep you from being locked out.",
              "Every signed-in device is listed, and you can sign each one out.",
              "A record of security activity lets you check what has happened on your account.",
              "Apps get your details only after you agree, and you can remove an app's access at any time.",
              "You can download your data or delete your account yourself."
            ]
          ]
        },
        {
          title: "App launcher",
          blocks: [
            "The apps menu lists the apps connected to your GozilaSim ID, so you can move between them without signing in again."
          ]
        },
        {
          title: "Make it yours",
          blocks: [
            "Use GozilaSim ID in English or Chinese. Pick the dark, light, or midnight theme, or set your own colors, and choose the background of the sign-in page."
          ]
        },
        {
          title: "What is not here yet",
          blocks: [
            [
              "Roles, teams, and shared accounts."
            ]
          ]
        },
        {
          title: "Privacy and terms",
          blocks: ["Read how your information is handled, and the terms for using the service."],
          links: [
            { label: "Privacy policy", path: "/privacy" },
            { label: "Terms of service", path: "/terms" }
          ]
        }
      ]
    }
  }
};

// ###############################################
// Chinese
// ###############################################

const zh: LegalCopy = {
  navLabel: "法律与帮助页面",
  introduction: "简介",
  onThisPage: "本页内容",
  lastUpdated: "最后更新：{date}",
  contactByEmail: "发送邮件至 {email}",
  contactFallback: "联系 GozilaSim 团队",
  documents: {
    privacy: {
      tab: "隐私",
      label: "隐私政策",
      headline: "使用 GozilaSim ID，即表示你把信息托付给我们。",
      body: "本政策说明 GozilaSim ID 收集哪些信息、为什么收集、与谁分享，以及你有哪些选择。内容反映的是服务目前的实际运作方式。",
      dated: true,
      sections: [
        {
          title: "我们收集的信息",
          blocks: [
            "我们只收集为你提供一个账号、用来登录各个已连接应用所必需的信息。",
            [
              "账号信息：你的邮箱、显示名称和密码。密码只以不可逆的哈希形式保存，不会以明文保存。",
              "你自愿填写的个人资料：姓名、电话、性别、生日、语言、时区和头像。这些都是选填的。",
              "登录保护：把验证器应用和你的账号关联起来的密钥，用来核对你的 6 位验证码。",
              "你自愿添加的恢复信息：恢复邮箱，以及只以不可逆哈希形式保存的备用验证码。",
              "会话和设备：每次登录，我们会记录 IP 地址、所用的浏览器和设备、登录时间，以及最近活跃时间。",
              "安全活动：登录、退出、修改密码、修改资料、更改额外验证等事件的记录，包括时间、IP 地址和设备。",
              "已连接的应用：当你允许某个应用使用你的账号时，我们会记录是哪个应用、你同意它查看哪些信息、同意的时间，以及它最近一次使用的时间。"
            ],
            "GozilaSim ID 不使用广告或统计类追踪工具，也不会为你建立广告画像。"
          ]
        },
        {
          title: "我们为什么收集",
          blocks: [
            [
              "创建你的账号并让你登录。",
              "保护你的账号：核对验证码、展示账号在哪些设备上登录，并帮助你发现不是你本人的操作。",
              "在 GozilaSim ID 和你登录的应用里显示你的名称和头像。",
              "在你选择继续前往某个应用时，把它申请的信息分享给它。",
              "按你的语言和时区显示日期和时间。",
              "向你发送与账号有关的邮件：密码重置链接，以及有你没用过的浏览器登录时的提醒。"
            ],
            "我们不出售你的信息，也不会把它用于广告。"
          ]
        },
        {
          title: "Cookie 和浏览器存储",
          blocks: [
            "GozilaSim ID 只设置一个 Cookie，用来保持你的登录状态。页面上的脚本无法读取它，它只通过安全连接发送，并在 7 天后过期，除非你更早退出登录。",
            "你的浏览器还会在本机保存几项偏好：主题、登录页背景、语言，以及（仅当你勾选“记住邮箱”时）你上次登录用的邮箱。这些内容只留在你的浏览器里。"
          ]
        },
        {
          title: "你的隐私控制",
          blocks: [
            [
              "个人信息：随时添加、修改或清除你的姓名、电话、性别、生日、语言和时区。",
              "头像：更换或移除头像，并永久删除以前用过的头像。",
              "安全和登录：修改密码、开启或关闭额外验证、设置备用验证码和恢复邮箱、查看所有已登录的设备，并让其中任何一台退出。",
              "安全活动：查看账号上最近发生的事件。",
              "已连接的应用：应用第一次请求使用你的账号时，你会看到它的名称和它想查看的信息，在你同意之前它拿不到任何内容。你可以随时查看这些应用，并移除任何一个的访问权限。",
              "数据与隐私：下载你的数据副本，或删除你的账号。"
            ]
          ],
          links: [
            { label: "个人信息", path: "/profile" },
            { label: "安全和登录", path: "/security" },
            { label: "已连接的应用", path: "/connected-apps" },
            { label: "数据与隐私", path: "/data-privacy" }
          ]
        },
        {
          title: "分享你的信息",
          blocks: [
            "我们只在以下情况分享你的信息。",
            [
              "分享给你登录的应用。应用一定会收到你的账号 ID，以及你是否开启了额外验证。根据它申请的范围，它还可能收到你的邮箱、个人资料（显示名称、姓名、头像、性别、生日、语言和时区）以及电话号码。",
              "分享给我们的图片托管服务。头像由 Cloudinary 存储并调整尺寸。",
              "分享给为我们投递邮件的邮件服务。它会收到你的邮箱地址和邮件内容。",
              "法律要求时。"
            ],
            "每个已连接的应用会按它自己的隐私政策处理收到的信息。"
          ]
        },
        {
          title: "保护你的信息",
          blocks: [
            [
              "密码以 bcrypt 哈希保存，GozilaSim 的任何人都无法看到你的密码。",
              "创建账号时就会设置基于验证器应用的额外验证。",
              "连续输错 5 次密码或验证码后，登录会被锁定 15 分钟，防止有人不停地猜。",
              "有你没用过的浏览器登录你的账号时，你会收到一封邮件。",
              "登录会话和授予应用的访问凭证都以哈希形式保存，而不是明文。",
              "应用通过带 PKCE 的 OpenID Connect 接入，只有在 GozilaSim ID 登记过的应用才能请你登录。",
              "重置密码会让所有设备退出登录，并收回之前授予应用的访问权限。"
            ],
            "没有任何系统是绝对安全的。如果发现不是你本人的操作，请立即修改密码并让其他设备退出登录。"
          ],
          links: [
            { label: "查看安全活动", path: "/security?section=activity" },
            { label: "查看已登录的设备", path: "/security?section=sessions" }
          ]
        },
        {
          title: "导出和删除你的信息",
          blocks: [
            "你可以在“个人信息”里查看全部个人资料，并清除任何选填项。你可以移除头像，也可以永久删除以前的头像，删除后它们也会从我们的图片托管服务中移除。",
            "在“数据与隐私”里，你可以把自己的数据下载成一个 JSON 文件，其中包含个人资料、已登录的设备、安全活动和已连接的应用，但绝不包含密码或其他任何密钥。",
            "你也可以在那里删除账号。确认时需要输入邮箱、密码和验证码。删除立即生效且无法恢复：个人资料、头像、登录会话、安全活动和所有应用的访问权限都会被移除。你登录过的应用会保留它们自己存下的内容，需要分别向它们申请删除。"
          ],
          links: [{ label: "数据与隐私", path: "/data-privacy" }]
        },
        {
          title: "信息保存多久",
          blocks: [
            [
              "账号和个人资料会在账号存在期间一直保存，删除账号时立即移除。",
              "你允许过的每个应用的记录会一直保存，直到你移除它的访问权限或删除账号。",
              "登录会话在你退出登录、从其他设备将它退出，或 7 天后过期时结束。",
              "安全活动随账号一起保存。账号页面显示最近的 50 条。",
              "以前的头像会一直保存，直到你删除它们。",
              "密码重置链接只能使用一次，30 分钟后失效。我们通过邮件发给你的一次性验证码 10 分钟后失效。登录应用时传给应用的一次性代码 5 分钟后失效，它给应用的访问权限 60 分钟后失效。"
            ]
          ]
        },
        {
          title: "本政策的变更",
          blocks: ["本政策有变更时，页面顶部的日期会更新，重要变更会在这里说明。"]
        },
        {
          title: "联系我们",
          blocks: ["如果对本政策或你的信息有疑问，请{contact}。"]
        }
      ]
    },
    terms: {
      tab: "条款",
      label: "服务条款",
      headline: "这些条款说明你可以对 GozilaSim ID 有什么期待，以及我们对你有什么期待。",
      body: "创建账号，或使用 GozilaSim ID 登录某个应用，即表示你同意这些条款。",
      dated: true,
      sections: [
        {
          title: "服务内容",
          blocks: [
            "GozilaSim ID 为你提供一个账号，用来登录所有与它连接的应用。你可以在一个地方管理个人资料、保护登录安全、查看设备和活动，并打开已连接的应用。"
          ]
        },
        {
          title: "你的账号",
          blocks: [
            [
              "创建账号时请提供准确的信息，并确保你能一直使用注册邮箱。它是你登录和恢复访问的凭据。",
              "账号仅供你本人使用。不要把密码或验证码告诉别人。",
              "你需要对账号下发生的操作负责。如果怀疑有人用过你的账号，请修改密码并让其他设备退出登录。"
            ]
          ],
          links: [{ label: "安全和登录", path: "/security" }]
        },
        {
          title: "保持对账号的访问",
          blocks: [
            "额外验证使用你手机上的验证器应用。如果你丢失了这个应用，仅凭密码无法重新登录。",
            "请设置备用验证码和恢复邮箱，这样没有验证器应用也能登录。如果两者都没有设置，就没有自助恢复账号的方式。",
            "换手机时，先在新手机上设置好验证器应用，再清除或转让旧手机。"
          ]
        },
        {
          title: "已连接的应用",
          blocks: [
            "第一次用 GozilaSim ID 登录某个应用时，我们会询问你是否允许该应用查看它请求的账号信息。同意后，我们会告诉该应用你是谁，并分享这些信息。之后再登录同一个应用不会再次询问，直到你在“已连接的应用”里移除它的访问权限。",
            "每个已连接的应用按它自己的条款和隐私政策运营，并对如何使用收到的信息负责。GozilaSim ID 不对已连接应用的内容或行为负责。"
          ]
        },
        {
          title: "禁止的行为",
          blocks: [
            [
              "访问或试图访问不属于你的账号。",
              "探测、压垮或干扰服务，或试图绕过它的安全措施。",
              "使用自动化手段批量注册账号，或猜测密码和验证码。",
              "冒充他人，或使用你无权使用的资料或图片。",
              "利用本服务从事违法活动。"
            ]
          ]
        },
        {
          title: "你的内容",
          blocks: [
            "你的个人资料和头像仍然归你所有。你授权 GozilaSim ID 保存它们，并在账号中心和你登录的应用里显示它们，仅用于提供本服务。",
            "头像必须是 PNG、JPG、WebP 或 GIF 图片，大小不超过 5 MB。"
          ]
        },
        {
          title: "暂停或关闭账号",
          blocks: [
            "对于违反这些条款，或危及服务或他人的账号，我们可以暂停或关闭。",
            "你可以随时停止使用 GozilaSim ID，也可以在“数据与隐私”里自行删除账号。删除立即生效，无法恢复。"
          ]
        },
        {
          title: "服务可用性和变更",
          blocks: [
            "GozilaSim ID 仍在持续开发中。功能可能会调整、增加或移除，服务也可能偶尔无法使用。",
            "服务按现状提供。在法律允许的范围内，我们不保证它始终可用或没有任何错误。"
          ]
        },
        {
          title: "条款的变更",
          blocks: ["这些条款有变更时，页面顶部的日期会更新。变更后继续使用 GozilaSim ID，即表示更新后的条款对你适用。"]
        },
        {
          title: "联系我们",
          blocks: ["如果对这些条款有疑问，请{contact}。"]
        }
      ]
    },
    help: {
      tab: "帮助",
      label: "帮助",
      headline: "查找登录、个人资料、密码和已连接应用方面的帮助。",
      body: "选择一个主题。每个主题都会告诉你该怎么做，以及在账号里的哪个位置操作。",
      sections: [
        {
          title: "开始使用",
          blocks: [
            [
              "用邮箱、显示名称和至少 8 个字符的密码创建账号。",
              "设置额外验证：用 Google Authenticator、Microsoft Authenticator 等验证器应用扫描二维码，然后输入它显示的 6 位验证码。",
              "按提示补充个人资料。任何一项都可以跳过，也可以关闭提示，稍后再填。"
            ]
          ]
        },
        {
          title: "登录问题",
          blocks: [
            [
              "邮箱或密码不对：先检查有没有输错，再使用登录页上的“忘记密码？”。",
              "验证码不被接受：验证码每 30 秒变化一次，请输入当前显示的那个，并确认手机的时间是自动设置的。",
              "验证器应用丢失：在验证步骤选择“换一种方式”，然后使用备用验证码，或发到恢复邮箱的验证码。如果两者都没有设置，请{contact}。",
              "尝试次数过多：连续输错 5 次密码或验证码后，登录会被锁定 15 分钟。请等到提示的时间之后再试，或者重置密码。",
              "被意外退出登录：一次登录有效 7 天，重置密码会让所有设备退出登录。"
            ]
          ],
          links: [{ label: "重置密码", path: "/forgot-password" }]
        },
        {
          title: "更新个人资料",
          blocks: [
            "打开“个人信息”可以修改姓名、性别、电话、生日、语言或时区。邮箱是你的登录凭据，不能在那里修改；点击它可以用我们发给你的验证码完成验证。",
            "要更换头像，可以在首页点击头像，或在账号菜单里选择“更换头像”。你可以上传不超过 5 MB 的 PNG、JPG、WebP 或 GIF 图片，移除头像，或恢复以前用过的头像。"
          ],
          links: [{ label: "个人信息", path: "/profile" }]
        },
        {
          title: "密码帮助",
          blocks: [
            [
              "修改密码：打开“安全和登录”，选择“密码”，输入当前密码和新密码。",
              "忘记密码：在登录页申请重置链接，我们会把它发到你的邮箱。链接只能使用一次，30 分钟后失效。",
              "如果开启了额外验证，完成重置时还需要验证器应用里的当前验证码。",
              "重置之后，所有设备都会退出登录，之前授予已连接应用的访问权限也会被收回。"
            ]
          ],
          links: [{ label: "修改密码", path: "/security?section=password" }]
        },
        {
          title: "额外验证",
          blocks: [
            "开启额外验证后，登录时需要输入验证器应用里的 6 位验证码，这样即使密码被盗，别人也进不了你的账号。",
            [
              "开启：打开“安全和登录”，选择“额外验证”，然后用验证器应用扫描二维码，或手动输入密钥。",
              "关闭：需要输入密码和当前验证码来确认。",
              "换手机时：先在新手机上设置好验证器应用，再清除旧手机。",
              "为了不被锁在账号外，请生成备用验证码并添加恢复邮箱。备用验证码只显示一次，请保存到安全的地方。"
            ]
          ],
          links: [
            { label: "额外验证设置", path: "/security?section=verification" },
            { label: "备用验证码", path: "/security?section=backup-codes" },
            { label: "恢复邮箱", path: "/security?section=recovery-email" }
          ]
        },
        {
          title: "设备和活动",
          blocks: [
            "“活跃会话”列出所有登录了你账号的浏览器和设备，以及各自最近的活跃时间。你可以让其中任何一台退出，也可以一次退出其他所有设备。",
            "“安全活动”显示最近的事件，例如登录、修改密码和修改资料。如果其中有不是你本人的操作，请修改密码并让其他设备退出登录。",
            "有你没用过的浏览器登录时，我们会给你发一封邮件，说明设备、时间和 IP 地址。",
            "“安全和登录”顶部的安全检查把值得留意的事项集中在一个列表里：额外验证、恢复方式、登录邮箱、新设备，以及很久没用的应用。"
          ],
          links: [
            { label: "活跃会话", path: "/security?section=sessions" },
            { label: "安全活动", path: "/security?section=activity" }
          ]
        },
        {
          title: "已连接的应用",
          blocks: [
            "使用 GozilaSim ID 的应用会把你带到这里登录。第一次登录时，你会看到应用的名称和它将能查看的信息，由你决定是否继续。之后再登录同一个应用，会直接进入。",
            "打开“已连接的应用”可以看到所有能使用你账号的应用、每个应用能查看什么，以及最近一次使用的时间。选择“移除访问权限”可以切断某个应用，下次使用它时需要重新登录并同意。",
            "要打开与你账号连接的应用，请使用页面顶部的应用菜单（九宫格图标）。"
          ],
          links: [{ label: "已连接的应用", path: "/connected-apps" }]
        },
        {
          title: "语言和外观",
          blocks: ["打开账号菜单可以切换语言或更改外观。语言会保存到你的账号；主题和登录页背景只保存在你当前使用的浏览器里。"]
        },
        {
          title: "你的数据和删除账号",
          blocks: [
            "打开“数据与隐私”可以查看账号里保存了什么，并把它下载成一个 JSON 文件。",
            [
              "下载数据：选择“下载你的数据”。文件包含个人资料、设备、安全活动和已连接的应用，绝不包含密码。",
              "删除账号：选择“删除账号”，然后用邮箱、密码和验证码确认。账号会立即删除，无法找回。",
              "删除之前：如果想留一份副本，请先下载数据；另外，你登录过的应用会保留它们自己存下的内容。"
            ]
          ],
          links: [{ label: "数据与隐私", path: "/data-privacy" }]
        },
        {
          title: "联系支持",
          blocks: ["如果这里没有你需要的内容，请{contact}。"]
        }
      ]
    },
    about: {
      tab: "关于",
      label: "关于 GozilaSim ID",
      headline: "GozilaSim ID 是管理个人资料和安全访问的账号中心。",
      body: "一个账号就能登录所有与 GozilaSim ID 连接的应用，并在一个地方管理你的资料、保护账号安全。",
      sections: [
        {
          title: "一个账号，登录所有应用",
          blocks: ["应用通过 OpenID Connect 这一开放的登录标准接入 GozilaSim ID。你只需在这里登录一次，每个应用只会收到它申请的信息。"]
        },
        {
          title: "账号中心",
          blocks: ["首页让你一眼看清账号状态：安全检查里需要处理的事项、有多少台设备已登录，以及最近一次登录的时间。从那里可以进入“个人信息”“安全和登录”“数据与隐私”和“已连接的应用”。"],
          links: [{ label: "前往你的账号", path: "/account" }]
        },
        {
          title: "安全和登录",
          blocks: [
            [
              "密码以不可逆的哈希形式保存。",
              "额外验证支持任何标准的验证器应用。",
              "备用验证码和恢复邮箱让你不会被锁在账号外。",
              "列出每一台已登录的设备，并可以让任何一台退出。",
              "安全活动记录让你随时查看账号上发生过什么。",
              "应用只有在你同意后才能拿到你的信息，你可以随时移除任何应用的访问权限。",
              "你可以自行下载数据或删除账号。"
            ]
          ]
        },
        {
          title: "应用启动器",
          blocks: ["应用菜单列出了与你的 GozilaSim ID 连接的应用，你可以在它们之间切换而不必重新登录。"]
        },
        {
          title: "个性化",
          blocks: ["GozilaSim ID 支持中文和英文。你可以选择深色、浅色或午夜蓝主题，也可以自定义颜色，还可以选择登录页的背景。"]
        },
        {
          title: "暂未提供的功能",
          blocks: [
            [
              "角色、团队和共享账号。"
            ]
          ]
        },
        {
          title: "隐私与条款",
          blocks: ["了解你的信息如何被处理，以及使用本服务的条款。"],
          links: [
            { label: "隐私政策", path: "/privacy" },
            { label: "服务条款", path: "/terms" }
          ]
        }
      ]
    }
  }
};

export const LEGAL_COPY: Record<SupportedLanguage, LegalCopy> = {
  en,
  "zh-CN": zh
};
