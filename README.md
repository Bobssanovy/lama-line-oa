# ลามะ (LAMA) — Google Apps Script

ระบบลาและลงเวลางานผ่าน LINE LIFF สำหรับหลายองค์กร โดยใช้ Google Apps Script และ Google Sheets เพื่อให้ทำงานออนไลน์โดยไม่ต้องเปิดคอมทิ้งไว้

## Revision

Revision ปัจจุบัน: **3.8.0**

## ความสามารถ

- LINE Login และลงทะเบียนพนักงาน
- แยกข้อมูลองค์กรด้วย Tenant ID และรหัสเชิญ
- ยื่นคำขอลา 11 ประเภท พร้อมคำนวณจำนวนวัน
- อนุมัติหรือไม่อนุมัติคำขอโดยผู้จัดการ
- ลงเวลาเข้าและออกงาน
- Dashboard และรายงานสำหรับผู้บริหาร
- อีเมลแจ้งเตือน 30 วันก่อนบริการหมดอายุ
- Audit log และการตรวจสิทธิ์ตามบทบาท

## เริ่มต้นใช้งาน

ดูขั้นตอนใน [google-apps-script/DEPLOY.md](google-apps-script/DEPLOY.md)

> ห้าม commit Channel Secret, Channel Access Token, `.env`, ข้อมูลพนักงาน หรือไฟล์ฐานข้อมูลลง repository

## สถานะ

ไฟล์ใน repository พร้อมสำหรับนำเข้า Google Apps Script แต่ยังไม่ได้ Deploy จนกว่าจะได้รับ URL `/exec` และอนุญาตสิทธิ์จากเจ้าของบัญชี Google

