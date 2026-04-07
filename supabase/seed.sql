insert into public.service_providers (name, phone, location, bio, is_verified)
values
  ('Abebe Woodworks', '+251911000001', 'Bole, Addis Ababa', 'Custom shelves, doors, office desks, and home repairs across Addis Ababa.', true),
  ('Marta Finish Painters', '+251911000002', 'CMC, Addis Ababa', 'Interior and exterior painting for homes, shops, and offices.', true),
  ('Tadesse Generator Repair', '+251911000003', 'Piassa, Addis Ababa', 'Generator diagnostics, maintenance, and emergency repair visits.', true)
on conflict (phone) do nothing;

insert into public.provider_services (provider_id, service_type_id)
select provider.id, service_type.id
from public.service_providers provider
join public.service_types service_type
  on (
    (provider.phone = '+251911000001' and service_type.slug = 'carpenter')
    or (provider.phone = '+251911000002' and service_type.slug = 'painter')
    or (provider.phone = '+251911000003' and service_type.slug = 'generator-technician')
  )
on conflict do nothing;
