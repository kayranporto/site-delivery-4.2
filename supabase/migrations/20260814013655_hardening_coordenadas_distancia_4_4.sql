-- Multi Delivery 4.4: hardening das coordenadas e do cálculo Haversine.

begin;

alter table public.empresa_unidades drop constraint if exists empresa_unidades_coordenadas_check;
alter table public.empresa_unidades add constraint empresa_unidades_coordenadas_check check (
  (latitude is null and longitude is null)
  or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
);

alter table public.enderecos drop constraint if exists enderecos_coordenadas_check;
alter table public.enderecos add constraint enderecos_coordenadas_check check (
  (latitude is null and longitude is null)
  or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
);

alter table public.entregadores drop constraint if exists entregadores_coordenadas_check;
alter table public.entregadores add constraint entregadores_coordenadas_check check (
  (latitude is null and longitude is null)
  or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
);

create or replace function private.distancia_km(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select round((
    6371.0088 * 2 * asin(
      least(1.0::double precision,
        sqrt(
          power(sin(radians(p_lat2 - p_lat1) / 2), 2)
          + cos(radians(p_lat1)) * cos(radians(p_lat2))
            * power(sin(radians(p_lon2 - p_lon1) / 2), 2)
        )
      )
    )
  )::numeric, 2);
$$;

revoke all on function private.distancia_km(double precision,double precision,double precision,double precision)
  from public, anon, authenticated, service_role;

commit;
