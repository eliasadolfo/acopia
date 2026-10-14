-- Unicidad para catálogos globales (org_id null): la unique compuesta no cubre NULL
create unique index if not exists ac_diccionario_global_uq on public.ac_diccionario (lower(original)) where org_id is null;
create unique index if not exists ac_categorias_global_uq on public.ac_categorias (nombre) where org_id is null;
