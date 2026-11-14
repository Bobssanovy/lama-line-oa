# LAMA Google Apps Script — Revision 3.8

ชุดนี้ทำงานบน Google Apps Script + Google Sheets จึงไม่ต้องเปิดคอมทิ้งไว้

## ไฟล์

- `index.html` — LIFF UI
- `code.js` — Apps Script backend; เปลี่ยนชื่อเป็น `Code.gs` ตอนนำเข้า Apps Script

## ตั้งค่า

1. เปิด `https://script.google.com` แล้วสร้าง New project
2. ตั้ง Project Settings > Time zone เป็น `Asia/Bangkok`
3. วางเนื้อหา `code.js` ในไฟล์ `Code.gs`
4. สร้าง HTML file ชื่อ `index` แล้ววางเนื้อหา `index.html`
5. เปิด Project Settings > Script properties และเพิ่ม:
   - `LINE_LOGIN_CHANNEL_ID` = `2012284280`
   - `LIFF_ID` = `2012284280-FgeCaHqF`
   - `DEFAULT_TENANT_CODE` = `lama-demo`
   - `APP_NAME` = `ลามะ • LAMA`
6. รันฟังก์ชัน `setupLama()` หนึ่งครั้งและอนุญาตสิทธิ์ Google Sheets, Mail และ Trigger แล้วจด `tenantCode` และ `inviteCode` จากผลลัพธ์
7. Deploy > New deployment > Web app
   - Execute as: Me
   - Who has access: Anyone
8. คัดลอก URL ที่ลงท้าย `/exec`
9. เปลี่ยน LIFF Endpoint URL ใน LINE Developers เป็น URL `/exec`
10. ทดสอบ `https://liff.line.me/2012284280-FgeCaHqF?view=leave`

## ความปลอดภัย

- ทุกคำสั่งสำคัญตรวจ LINE ID token กับ LINE โดยตรง
- ผู้ใช้ถูกผูกกับ Tenant ด้วยรหัสองค์กรและรหัสเชิญแบบสุ่ม 12 ตัว
- Backend กรองข้อมูลด้วย `tenantId` ทุกครั้ง
- พนักงานเห็นข้อมูลของตนเอง ผู้จัดการขึ้นไปจึงเห็นภาพรวมและอนุมัติได้
- ห้ามใส่ Channel Secret หรือ Access Token ใน `index.html`

## ข้อจำกัด

- Google Sheets เหมาะกับการทดลองหรือองค์กรขนาดเล็ก ไม่เหมาะกับคำขอพร้อมกันจำนวนมาก
- การตอบ LINE Webhook ที่ต้องตรวจ `x-line-signature` ควรย้ายไป Cloud Run; ชุดนี้เน้น LIFF direct links
- MailApp มีโควตาส่งอีเมลตามประเภทบัญชี Google
- การใช้งานจริงหลายองค์กรควรย้ายข้อมูลไป Firestore และ API ไป Cloud Run

