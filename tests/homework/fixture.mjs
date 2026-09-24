export const ids = {
  c: process.env.FEAT004_UPGRADE ? "4e0b25e4-ec47-4745-8b2b-ba91c1504254" : "00000000-0000-0000-0000-000000000001",
  y: "00000000-0000-0000-0000-000000000002",
  s: "00000000-0000-0000-0000-000000000003",
  m: "00000000-0000-0000-0000-000000000004",
  t: "00000000-0000-0000-0000-000000000005",
  a: "00000000-0000-0000-0000-000000000006",
  other: "00000000-0000-0000-0000-000000000007",
};

export async function createFixture(){
const modulePath = process.env.PGLITE_MODULE || "@electric-sql/pglite";
const { PGlite } = await import(modulePath);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.school_years(id uuid primary key,start_date date,end_date date);
create table public.classes(id uuid primary key,school_year_id uuid references school_years,active boolean);
create table public.profiles(id uuid primary key,role text,active boolean,class_id uuid references classes,full_name text,deleted_at timestamptz);
create table public.class_teachers(class_id uuid,teacher_id uuid,active boolean);
create table public.weeks(id uuid primary key,school_year_id uuid,start_date date,end_date date,week_number int);
insert into school_years values('${ids.y}','2026-07-01','2027-06-30');
insert into classes values('${ids.c}','${ids.y}',true);
insert into profiles values('${ids.s}','student',true,'${ids.c}','Student',null),('${ids.m}','monitor',true,'${ids.c}','Monitor',null),('${ids.t}','teacher',true,null,'Teacher',null),('${ids.a}','admin',true,null,'Admin',null),('${ids.other}','student',true,'${ids.c}','Other',null);
insert into class_teachers values('${ids.c}','${ids.t}',true);`);

if(process.env.FEAT004_UPGRADE)await db.exec("alter table classes add column code text default '7A9';alter table classes add column name text default '7A9';");
return db;
}
