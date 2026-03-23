# 🥋 Judo turnaje → Kalendář

Chrome rozšíření pro rozhodčí Českého svazu judo. Jedním kliknutím exportuje delegované turnaje z portálu rozhodčích do libovolného kalendáře.

---

## Co to umí

Rozšíření se aktivuje na stránce portálu rozhodčích (rozhodci.csju.cz). Na stránce se soutěžemi přidá modré tlačítko **📅 Uložit do kalendáře**. Po kliknutí nabídne dva způsoby exportu:

### Google Kalendář (přímé uložení)
Turnaje se okamžitě vytvoří jako celodenní události ve tvém Google Kalendáři. Stačí se jednou přihlásit Google účtem a pak už jen klikat. Rozšíření hlídá duplicity – stejný turnaj se nepřidá dvakrát.

### .ics soubor (pro jakýkoliv kalendář)
Stáhne se soubor s příponou `.ics`, který funguje s prakticky jakoukoliv kalendářovou aplikací:

- **Apple Calendar** (iPhone, iPad, Mac) – otevři stažený soubor a klepni na „Přidat vše"
- **Microsoft Outlook** (desktop i web) – dvakrát klikni na soubor nebo v Outlooku zvol Soubor → Otevřít
- **Seznam Kalendář** – v nastavení vyber „Import událostí" a nahraj .ics soubor
- **Thunderbird** – přetáhni soubor do kalendáře
- **Samsung Calendar, Xiaomi Calendar** – otevři soubor z notifikace „Staženo"

ICS je univerzální formát kalendářových událostí – není to nic proprietárního a funguje všude. Nepotřebuješ k tomu Google účet ani žádné přihlašování.

### Co se exportuje

- Pouze **delegované turnaje** – zelená (Rozhodčí) a oranžová (Technický)
- Turnaje se stavem „Mám zájem" se záměrně přeskakují – to není potvrzená delegace
- Automaticky se projdou **všechny stránky** portálu (pagination)
- Každý turnaj se exportuje jako celodenní událost s rolí v popisu
- Připomínky: 1 den a 1 týden před turnajem (nastavitelné)

### Nastavení

V rozšíření je stránka nastavení (⚙️ v popup):

- **Barva události** – výběr z 11 barev Google Kalendáře
- **Cílový kalendář** – hlavní nebo vlastní sub-kalendář
- **Připomínky** – dva nastavitelné časy
- **Emoji prefix** – zapnout/vypnout 🥋 v názvu

---

## 👤 Pro rozhodčí – jak začít

### 1. Nainstaluj rozšíření
Klikni na odkaz od správce → **Přidat do Chromu** (funguje i v Edge a Opeře).

### 2. Přihlas se (volitelné)
Klikni na ikonku 🥋 v liště prohlížeče → **Přihlásit se přes Google**.
Toto potřebuješ **jen pokud chceš ukládat přímo do Google Kalendáře**. Pro stahování .ics souboru přihlášení nepotřebuješ.

### 3. Exportuj turnaje
Otevři portál rozhodčích jako obvykle → na stránce se soutěžemi klikni na modré tlačítko **📅 Uložit do kalendáře** → vyber turnaje → zvol **Google Kalendář** nebo **Stáhnout .ics**.

---

## 🔧 Pro správce – jednorázové nastavení

### 1. Google Cloud projekt
1. [console.cloud.google.com](https://console.cloud.google.com/) → nový projekt
2. APIs & Services → Library → zapni **Google Calendar API**

### 2. OAuth Consent Screen
1. APIs & Services → OAuth consent screen → External → Create
2. Vyplň název, emaily
3. Scopes: přidej `calendar.events` a `userinfo.email`
4. Test users: přidej emaily rozhodčích pro testování (max 100)

### 3. OAuth Client ID
1. Credentials → + Create Credentials → OAuth client ID
2. Typ: Chrome extension
3. Application ID: ID rozšíření z chrome://extensions
4. Zkopíruj Client ID → vlož do `manifest.json`

### 4. Distribuce
Publikuj na Chrome Web Store (viz samostatný návod) nebo pošli ZIP k ruční instalaci.

---

## 🔒 Bezpečnost

- Rozšíření nikdy nepotřebuje heslo k portálu
- Google OAuth přes oficiální Chrome API
- Přístup pouze k vytváření kalendářních událostí
- Žádná data se neposílají na třetí servery
