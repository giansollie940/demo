/*
  Cấu hình triển khai thật. Chỉ điền Project URL và publishable/anon key.
  Không đưa secret key hoặc service_role key vào mã nguồn giao diện.
*/
window.APP_CONFIG = {
  mode: "supabase",
  projectUrl: "https://qhqqujozpqopahxscpks.supabase.co",
  publishableKey: "sb_publishable_iIrcm25VPzeURIKYTU1nlQ_QEvbZiCT",
  appName: "Sổ Tự Học",
  // Học sinh chỉ nhập mã. App ánh xạ 10A1-01 -> 10a1-01@users.example.com.
  // Domain này chỉ là định danh nội bộ, không dùng để nhận thư.
  loginDomain: "users.example.com",
  timeZone: "Asia/Ho_Chi_Minh",
  refreshSeconds: 60
};
