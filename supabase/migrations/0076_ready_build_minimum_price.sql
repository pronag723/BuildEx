-- Lower the ready-made marketplace floor from $20.00 to $5.00.
alter table public.ready_builds
  drop constraint if exists ready_builds_price_kopecks_check;

alter table public.ready_builds
  add constraint ready_builds_price_kopecks_check check (price_kopecks >= 500);
