# ตัดดี — ระบบจองคิวร้านตัดผม

เว็บจองคิวเชื่อม Supabase Auth และ Database แล้ว โดยใช้ publishable key ฝั่งหน้าเว็บ, RLS และ RPC ป้องกันคิวทับซ้อน

## ขั้นตอนเปิดใช้งาน

1. เปิด Supabase SQL Editor: https://supabase.com/dashboard/project/vfawyvszzhlhrhtfzurg/sql/new
2. รัน `supabase/migrations/20261127_public_slot_availability.sql` หลังจาก schema หลักถูกติดตั้งแล้ว (ไฟล์ `supabase/schema.sql`). RPC นี้เปิดเผยเฉพาะช่วงเวลาที่ถูกจอง ไม่เปิดเผยข้อมูลลูกค้า
3. ใน Supabase ไปที่ **Authentication → URL Configuration** แล้วเพิ่ม Site URL ของเว็บและ Redirect URL ที่ใช้งาน
4. เปิด GitHub repository **Settings → Pages**, เลือก Source เป็น **GitHub Actions**. Workflow จะเผยแพร่เว็บหลัง push
5. เปิดเว็บ กด **เข้าสู่ระบบ → สมัครสมาชิก**. การจองและรายการนัดจะผูกกับบัญชีที่เข้าสู่ระบบ
6. หลังสมัครบัญชีเจ้าของร้านและยืนยันอีเมลแล้ว ตั้งเป็น admin จาก Supabase SQL Editor:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'owner@example.com');
   ```

   ใช้อีเมลจริงแทนตัวอย่าง และรันคำสั่งนี้ใน Supabase Dashboard เท่านั้น อย่าเปิดการแก้ role ให้ client

## ความปลอดภัยและขอบเขต

- `config.js` มีเฉพาะ Project URL และ publishable key ซึ่งตั้งใจให้ browser ใช้ได้; ห้ามใส่ `service_role` key หรือ database password ลงใน repository
- ตารางนัดใช้ RLS และ exclusion constraint ใน PostgreSQL ทำให้คิวช่างคนเดียวกันไม่สามารถทับเวลาพร้อมกันได้ แม้มีผู้จองพร้อมกันจากหลายอุปกรณ์
- การสร้าง/ยกเลิกนัดผ่าน RPC ที่ตรวจตัวตนและสิทธิ์
- ระบบแจ้ง LINE/อีเมลและ custom domain ยังไม่ได้ตั้งค่า
- ก่อนรับข้อมูลจริง ควรตรวจ auth settings, privacy policy, การยืนยันอีเมล, retention และทดสอบด้วยบัญชีลูกค้า/admin แยกกัน

## Custom domain

ต้องมีโดเมนที่คุณเป็นเจ้าของ จากนั้นใส่ใน **Settings → Pages → Custom domain**, ตั้ง DNS ที่ผู้ให้บริการโดเมน และรอ GitHub ตรวจสอบก่อนเปิด Enforce HTTPS. เพิ่ม URL ของโดเมนใน Supabase Auth Redirect URLs ด้วย
