-- ═══════════════════════════════════════════════════════════════════
-- DineLine AI · Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`), then
-- run seed.sql, then `npm run seed:supabase` for demo history.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- Restaurant settings: one row, stored as JSON so the same build can be
-- resold to any restaurant by editing a single record.
create table if not exists settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists menu_items (
  id            text primary key,
  name          text not null,
  category      text not null,
  description   text not null default '',
  price         numeric(10,2) not null,
  sizes         jsonb not null default '[]',
  add_ons       jsonb not null default '[]',
  allergens     text[] not null default '{}',
  dietary       text[] not null default '{}',
  spicy         smallint not null default 0,
  is_available  boolean not null default true,
  is_upsell     boolean not null default false,
  popular       boolean not null default false,
  sort_order    int not null default 0
);

create table if not exists customers (
  id             text primary key,
  phone          text not null unique,
  name           text not null default '',
  total_orders   int not null default 0,
  last_order_id  text,
  notes          text not null default '',
  created_at     timestamptz not null default now()
);

create sequence if not exists order_number_seq start 1001;

create table if not exists orders (
  id              text primary key,
  order_number    int not null unique,
  customer_id     text references customers(id) on delete set null,
  customer_name   text not null,
  customer_phone  text not null,
  type            text not null check (type in ('pickup','delivery')),
  address         text,
  items           jsonb not null default '[]',
  subtotal        numeric(10,2) not null,
  tax             numeric(10,2) not null,
  delivery_fee    numeric(10,2) not null default 0,
  total           numeric(10,2) not null,
  status          text not null default 'new'
                  check (status in ('new','preparing','ready','out_for_delivery','completed','cancelled')),
  channel         text not null default 'phone',
  upsell_accepted boolean not null default false,
  ready_at        timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);

-- Line items, one row per item, for reporting in SQL.
create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      text not null references orders(id) on delete cascade,
  menu_item_id  text,
  name          text not null,
  quantity      int not null,
  size          text,
  add_ons       text[] not null default '{}',
  notes         text not null default '',
  unit_price    numeric(10,2) not null,
  line_total    numeric(10,2) not null
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists dining_tables (
  id      text primary key,
  number  int not null unique,
  seats   int not null,
  area    text not null check (area in ('indoor','patio','private'))
);

create table if not exists reservations (
  id              text primary key,
  code            text not null unique,
  customer_id     text references customers(id) on delete set null,
  customer_name   text not null,
  customer_phone  text not null,
  date            date not null,
  time            text not null,           -- HH:MM, restaurant local time
  party_size      int not null,
  table_id        text references dining_tables(id) on delete set null,
  occasion        text not null default '',
  seating         text not null default 'any',
  status          text not null default 'booked'
                  check (status in ('booked','seated','completed','cancelled','no_show','waitlist')),
  channel         text not null default 'phone',
  reminder_sent   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists reservations_date_idx on reservations (date, time);

create table if not exists calls (
  id                text primary key,
  external_id       text unique,          -- Vapi call id
  channel           text not null default 'phone',
  caller_phone      text not null default '',
  caller_name       text not null default '',
  agents            text[] not null default '{}',
  outcome           text not null default 'in_progress',
  summary           text not null default '',
  transcript        jsonb not null default '[]',
  recording_url     text,
  duration_seconds  int not null default 0,
  cost              numeric(10,4) not null default 0,
  order_id          text,
  reservation_id    text,
  created_at        timestamptz not null default now()
);
create index if not exists calls_created_idx on calls (created_at desc);

create table if not exists notifications (
  id          text primary key,
  kind        text not null,
  channel     text not null default 'sms',
  "to"        text not null,
  body        text not null,
  status      text not null,
  provider    text not null,
  related_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_created_idx on notifications (created_at desc);

-- Atomic order numbers
create or replace function next_order_number() returns int
language sql as $$ select nextval('order_number_seq')::int $$;

-- Moves the order number sequence past the highest existing order (used after seeding)
create or replace function sync_order_number() returns int
language sql as $$
  select setval('order_number_seq', greatest(coalesce((select max(order_number) from orders), 1000), 1000))::int
$$;

-- Keep updated_at fresh
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();
drop trigger if exists reservations_touch on reservations;
create trigger reservations_touch before update on reservations
  for each row execute function touch_updated_at();

-- Realtime for the kitchen board
do $$ begin
  begin alter publication supabase_realtime add table orders; exception when others then null; end;
  begin alter publication supabase_realtime add table reservations; exception when others then null; end;
end $$;

-- The app talks to Supabase with the service role key on the server only.
-- Row level security is on with no public policies, so the anon key cannot read data.
alter table settings      enable row level security;
alter table menu_items    enable row level security;
alter table customers     enable row level security;
alter table orders        enable row level security;
alter table order_items   enable row level security;
alter table dining_tables enable row level security;
alter table reservations  enable row level security;
alter table calls         enable row level security;
alter table notifications enable row level security;
