<p align="center">
  <img src="./image/logo_2.png" alt="Facebook Comment Scraper cover" width="100%">
</p>

<h1 align="center">Facebook Comment Scraper</h1>

<p align="center">
  Chrome Extension สำหรับดึงความคิดเห็นจาก Facebook ผ่าน Side Panel<br>
  รองรับคอมเมนต์ย่อย รูปภาพ Live Preview และส่งออก CSV / JSON
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3">
  <img src="https://img.shields.io/badge/version-1.3-4F46E5" alt="Version 1.3">
  <img src="https://img.shields.io/badge/tests-19%20passing-10B981" alt="19 tests passing">
  <img src="https://img.shields.io/badge/export-CSV%20%7C%20JSON-06B6D4" alt="CSV and JSON export">
</p>

---

## ภาพรวม

Facebook Comment Scraper ช่วยเก็บความคิดเห็นจากโพสต์ Facebook ที่บัญชีของคุณมองเห็น โดยทำงานจากหน้าเว็บโดยตรง ไม่ต้องใช้ Facebook Graph API

เหมาะสำหรับงานรวบรวม feedback, วิเคราะห์ความคิดเห็น, สำรวจตลาด หรือสำรองข้อมูลความคิดเห็นที่คุณมีสิทธิ์เข้าถึง

### รองรับโพสต์ประเภทไหน

- โพสต์จากเพจ
- โพสต์ในกลุ่ม Public และ Private ที่บัญชีเข้าถึงได้
- โพสต์ทั่วไปบน News Feed
- หน้าโพสต์เดี่ยว เช่น `/posts/` และ `/permalink.php`
- โพสต์รูปภาพและวิดีโอ

> หน้าโพสต์เดี่ยวรองรับการตรวจจับอัตโนมัติ ส่วนหน้าเพจ กลุ่ม และ News Feed ให้เลือกโพสต์ผ่านปุ่ม **ดึงความเห็น** หรือโหมด **เลือกโพสต์**

## จุดเด่น

- ดึงความคิดเห็นหลักและ replies
- กดปุ่ม `📊 ดึงความเห็น` บนโพสต์แล้วเริ่มทำงานทันที
- สลับตัวกรองเป็น All Comments อัตโนมัติเมื่อทำได้
- ขยายคอมเมนต์แบบ adaptive รอ DOM เปลี่ยนจริง ลดเวลารอแบบคงที่
- กำหนดจำนวนคอมเมนต์หลักสูงสุดได้
- เก็บชื่อผู้เขียน โปรไฟล์ เวลา ข้อความ และลิงก์รูปภาพ
- แสดง Live Preview สูงสุด 200 รายการ โดยข้อมูล export ยังครบ
- ล็อก Live Preview ก่อนเปิดชื่อ Avatar หรือรูปในแท็บใหม่ได้
- เลือกหัวข้อที่ต้องการบันทึกก่อน export
- ส่งออก Excel-compatible CSV พร้อม UTF-8 BOM
- ส่งออก JSON แบบ tree โดยเก็บ replies ใต้ความคิดเห็นหลัก
- ป้องกันข้อความที่อาจถูก spreadsheet ตีความเป็นสูตร
- กัน scrape ซ้อนและผลลัพธ์จาก run เก่าปน run ใหม่

## ติดตั้งจาก Source

### 1. ดาวน์โหลดโปรเจกต์

ดาวน์โหลด ZIP จาก GitHub แล้วแตกไฟล์ หรือ clone ด้วยคำสั่ง:

```bash
git clone https://github.com/rxvxrsx/Facebook-Comment-Scraper.git
```

### 2. โหลด Extension เข้า Chrome

1. เปิด `chrome://extensions`
2. เปิด **Developer mode** มุมขวาบน
3. กด **Load unpacked**
4. เลือกโฟลเดอร์ `Facebook-Comment-Scraper`
5. ปักหมุด Extension ไว้บน toolbar เพื่อเปิดใช้งานง่าย

> การใช้งานปกติไม่ต้องติดตั้ง Node.js และไม่ต้องรัน `npm install`

## วิธีใช้งาน

1. ล็อกอิน Facebook ด้วยบัญชีที่มีสิทธิ์ดูโพสต์เป้าหมาย
2. เปิดหน้าเพจ กลุ่ม News Feed หรือหน้าโพสต์เดี่ยว
3. กดไอคอน Extension เพื่อเปิด Side Panel
4. ตั้งค่าการดึงข้อมูลใน Side Panel; ระบบจะจำค่าไว้
5. เริ่มงานด้วยวิธีใดวิธีหนึ่ง:
   - กดปุ่ม `📊 ดึงความเห็น` บนโพสต์เพื่อเริ่มทันที
   - กด **เลือกโพสต์บนหน้า Facebook** แล้วคลิกโพสต์ จากนั้นกด **เริ่มดึงข้อมูล**
6. รอจนสถานะขึ้นว่าเสร็จสิ้น
7. เลือกหัวข้อที่ต้องการบันทึก แล้วส่งออก CSV หรือ JSON

## ตัวเลือกการดึงข้อมูล

| ตัวเลือก | รายละเอียด |
|---|---|
| Expand replies | ขยายและดึงความคิดเห็นตอบกลับ |
| Include images | ตรวจหารูปภาพที่แนบในความคิดเห็น |
| Comment limit | จำกัดจำนวนความคิดเห็นหลัก; `0` หมายถึงไม่จำกัด |
| Click delay | เวลาหน่วงระหว่างการกดปุ่มขยาย ช่วง 1–10 วินาที |

## หัวข้อที่เลือกส่งออกได้

| หัวข้อ | ความหมาย |
|---|---|
| `ID` | รหัสลำดับภายในไฟล์ export |
| `Type` | `Comment` หรือ `Reply` |
| `Author_Name` | ชื่อผู้เขียนความคิดเห็น |
| `Profile_Link` | ลิงก์โปรไฟล์ Facebook |
| `Timestamp` | เวลาที่ Facebook แสดงบนความคิดเห็น |
| `Text` | เนื้อหาความคิดเห็น |
| `Photo_Link` | ลิงก์หน้ารูปภาพที่แนบ |

ค่าที่เลือกจะถูกจำไว้ในเครื่อง และใช้กับทั้ง CSV และ JSON

## Live Preview

หลังดึงข้อมูลเสร็จ ปุ่ม **ล็อกผลลัพธ์** จะเปิดใช้งาน

1. กด `🔓 ล็อกผลลัพธ์`
2. ปุ่มเปลี่ยนเป็น `🔒 ล็อกแล้ว`
3. คลิกชื่อ Avatar หรือรูปภาพเพื่อเปิดแท็บใหม่
4. ข้อมูลใน Side Panel จะยังอยู่แม้ active tab เปลี่ยน

การเริ่ม scrape ใหม่หรือการล้างผลลัพธ์จะปลดล็อกอัตโนมัติ

## รูปแบบข้อมูล

### CSV

```csv
ID,Type,Author_Name,Profile_Link,Timestamp,Text,Photo_Link
comment_1,Comment,Alice,https://facebook.com/alice,1h,สินค้าดีมาก,
comment_2,Reply,Bob,https://facebook.com/bob,30m,ขอบคุณครับ,
```

### JSON

```json
[
  {
    "id": "comment_1",
    "type": "Comment",
    "name": "Alice",
    "text": "สินค้าดีมาก",
    "replies": [
      {
        "id": "comment_2",
        "type": "Reply",
        "name": "Bob",
        "text": "ขอบคุณครับ"
      }
    ]
  }
]
```

ฟิลด์ในไฟล์จริงขึ้นอยู่กับหัวข้อที่เลือกใน Side Panel

## การพัฒนาและทดสอบ

ต้องใช้ Node.js 24 หรือรุ่นที่รองรับ dependency ใน `package.json`

```bash
npm install
npm run check
```

หรือรันเฉพาะ tests:

```bash
npm test
```

ชุดทดสอบครอบคลุม:

- DOM fixtures ภาษาไทยและอังกฤษ
- การแยกความคิดเห็นหลักและ reply
- ปุ่มขยายแบบซ้อนและปุ่มที่ Facebook reuse
- limit-aware loading
- adaptive DOM waiting
- profile URL normalization
- CSV / JSON field selection
- Side Panel export menu และ Live Preview lock UI
- การ normalize และ sync options ระหว่างปุ่มบนโพสต์กับ Side Panel

## โครงสร้างโปรเจกต์

```text
Facebook-Comment-Scraper/
├── background.js          # Service Worker และ Side Panel behavior
├── content.js             # เลือกโพสต์ ขยาย และอ่านความคิดเห็นจาก DOM
├── scraper-core.js        # Shared scraping helpers
├── export-core.js         # เลือกฟิลด์และสร้างข้อมูล CSV / JSON
├── sidepanel.html         # หน้าตา Side Panel
├── sidepanel.js           # State, Preview และ Export controller
├── manifest.json          # Chrome Extension Manifest V3
├── image/
│   ├── logo_1.png         # โลโก้ Extension และ Side Panel
│   └── logo_2.png         # ภาพปก README
└── test/                  # Regression tests และ DOM fixtures
```

## แก้ปัญหาเบื้องต้น

<details>
<summary><strong>ไม่เห็นปุ่มดึงความเห็นบน Facebook</strong></summary>

1. เปิด `chrome://extensions`
2. กด Reload ที่ Extension
3. Refresh หน้า Facebook
4. ตรวจว่า URL อยู่บน `facebook.com` หรือ `fb.com`

</details>

<details>
<summary><strong>Side Panel แจ้งว่า content script ไม่พร้อม</strong></summary>

Refresh หน้า Facebook หนึ่งครั้งหลังติดตั้งหรืออัปเดต Extension แล้วลองใหม่

</details>

<details>
<summary><strong>ดึงความคิดเห็นได้ไม่ครบ</strong></summary>

- ตรวจว่า account มองเห็นความคิดเห็นนั้นจริง
- เพิ่ม Click delay หาก Facebook โหลดช้า
- ตั้ง Comment limit เป็น `0`
- เปิด Expand replies
- Facebook อาจเปลี่ยน DOM หรือกำลัง rollout UI คนละรูปแบบ

</details>

<details>
<summary><strong>Live Preview หายเมื่อเปิดโปรไฟล์หรือรูป</strong></summary>

กด **ล็อกผลลัพธ์** ก่อนเปิดลิงก์จาก Live Preview

</details>

## ความเป็นส่วนตัว

- ประมวลผลข้อมูลภายใน browser
- ไม่มี server สำหรับรับหรือเก็บความคิดเห็นในโปรเจกต์นี้
- บันทึก options ล่าสุดใน `chrome.storage.local` เพื่อให้ปุ่มบนโพสต์เริ่มงานด้วยค่าเดียวกับ Side Panel
- ส่งข้อมูลออกเมื่อผู้ใช้กดดาวน์โหลด CSV หรือ JSON เท่านั้น
- เข้าถึงเฉพาะหน้า Facebook และข้อมูลที่บัญชีมองเห็น

## ข้อจำกัดและความรับผิดชอบ

- Extension อ่านข้อมูลจาก Facebook DOM ไม่ใช่ Graph API
- Facebook เปลี่ยน DOM ได้ตลอดเวลา จึงไม่รับประกันว่าจะรองรับทุก UI rollout
- ผลลัพธ์ขึ้นอยู่กับความคิดเห็นที่ Facebook โหลดและสิทธิ์ของบัญชี
- ผู้ใช้ต้องปฏิบัติตามกฎหมาย นโยบาย Facebook และข้อกำหนดด้านข้อมูลส่วนบุคคล
- โปรเจกต์นี้ไม่ได้เป็นผลิตภัณฑ์อย่างเป็นทางการของ Meta หรือ Facebook

## Credit

พัฒนาและดูแลโดย [@rxvxrsx](https://github.com/rxvxrsx)

Source code: [Facebook Comment Scraper](https://github.com/rxvxrsx/Facebook-Comment-Scraper)

## สนับสนุนโปรเจกต์

พบปัญหาหรือต้องการเสนอฟีเจอร์ เปิด Issue ได้ที่
[GitHub Issues](https://github.com/rxvxrsx/Facebook-Comment-Scraper/issues)

<p align="center">
  สร้างเพื่อให้การรวบรวมความคิดเห็นเป็นงานที่ง่ายขึ้น
</p>
