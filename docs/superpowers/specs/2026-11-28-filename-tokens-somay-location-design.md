# Design: Token filename - `{HOTEN}`, `{SOMAY}` từ Vị trí máy

**Ngày:** 2026-11-28  
**Trạng thái:** implemented  

## Quyết định

- Token khai mới: `{MSSV}`, `{HOTEN}`, `{SOMAY}` (bỏ `{PHONG}`, `{TEN}` trên form/DTO).
- `{SOMAY}` = `computer.location` (Vị trí), tra theo `roomId` phiên + hostname agent; trống → `mãPhòng_hostname`.
- Legacy `{TEN}` / `{PHONG}` vẫn soft-render cho pattern cũ trong DB.

## Chi tiết

Xem [`filename-template.ts`](../../../apps/api/src/exam-session/filename-template.ts) và resolve lúc `agent:join` trong gateway.
