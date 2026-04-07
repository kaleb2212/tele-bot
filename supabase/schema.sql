create table if not exists public.clients (
  id bigserial primary key,
  telegram_id bigint unique not null,
  name varchar(255),
  phone varchar(32),
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.service_providers (
  id bigserial primary key,
  name varchar(255) not null,
  phone varchar(32) unique not null,
  location varchar(255),
  bio text,
  is_verified boolean default false,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.service_types (
  id serial primary key,
  name varchar(100) unique not null,
  slug varchar(100) unique not null
);

insert into public.service_types (name, slug)
values
  ('Carpenter', 'carpenter'),
  ('Painter', 'painter'),
  ('Roofer', 'roofer'),
  ('General Handyman', 'general-handyman'),
  ('Appliance Repair Technician', 'appliance-repair-technician'),
  ('Security System Installer', 'security-system-installer'),
  ('Gutter Installer / Cleaner', 'gutter-installer-cleaner'),
  ('Landscaper / Lawn Care Specialist', 'landscaper-lawn-care'),
  ('Pest Control Technician', 'pest-control-technician'),
  ('Generator Technician', 'generator-technician')
on conflict (slug) do nothing;

create table if not exists public.provider_services (
  provider_id bigint references public.service_providers(id) on delete cascade,
  service_type_id int references public.service_types(id) on delete cascade,
  primary key (provider_id, service_type_id)
);

create table if not exists public.service_requests (
  id bigserial primary key,
  client_id bigint references public.clients(id) on delete set null,
  provider_id bigint references public.service_providers(id) on delete set null,
  service_type_id int references public.service_types(id) on delete set null,
  description text,
  client_location varchar(255),
  status varchar(20) default 'NEW' check (status in ('NEW', 'MATCHED', 'REQUESTED', 'ACCEPTED', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_service_requests_updated_at on public.service_requests;
create trigger trg_service_requests_updated_at
before update on public.service_requests
for each row
execute function public.set_updated_at();

create index if not exists idx_clients_telegram_id on public.clients(telegram_id);
create index if not exists idx_service_providers_location on public.service_providers(location);
create index if not exists idx_service_types_slug on public.service_types(slug);
create index if not exists idx_service_requests_status on public.service_requests(status);
