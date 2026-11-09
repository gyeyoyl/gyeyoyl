-- =====================================================
-- GUEST 방명록(바둑판) 저장용 테이블
-- Supabase 왼쪽 메뉴 SQL Editor에 전체를 붙여넣고 Run을 누르세요.
-- 한 번만 실행하면 됩니다.
-- =====================================================

-- 1. 돌(방명록) 테이블
create table if not exists public.stones (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  x          smallint not null check (x between 0 and 18),          -- 가로 위치 (19줄)
  y          smallint not null check (y between 0 and 18),          -- 세로 위치 (19줄)
  color      text     not null check (color in ('pink', 'black')),  -- 돌 색
  size       real     not null check (size between 0.6 and 2.2),    -- 돌 크기
  message    text     not null check (char_length(message) between 1 and 200) -- 방명록 글 (200자까지)
);

-- 2. 보안 규칙 켜기
alter table public.stones enable row level security;

-- 3. 누구나 읽기 가능
drop policy if exists "stones: anyone can read" on public.stones;
create policy "stones: anyone can read"
  on public.stones for select
  to anon, authenticated
  using (true);

-- 4. 누구나 돌 추가 가능 (수정·삭제 규칙은 만들지 않음 → 방문자는 수정·삭제 불가)
drop policy if exists "stones: anyone can add" on public.stones;
create policy "stones: anyone can add"
  on public.stones for insert
  to anon, authenticated
  with check (true);

-- 5. 방문자에게는 읽기·추가 권한만
revoke all on public.stones from anon, authenticated;
grant select, insert on public.stones to anon, authenticated;
