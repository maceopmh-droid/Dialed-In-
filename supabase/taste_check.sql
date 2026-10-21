-- Read-only: are any sessions' taste sliders different from what the Sheet had (the archive keeps every Sheet save)?
-- Prints only counts, first names and session ids; never a value.
with arch as (
  select distinct on (payload->>'id') payload->>'id' as lid, payload
  from sheet_archive
  where payload->>'type' = 'brew'
  order by payload->>'id', row_no desc nulls last, received_at desc
), k(key) as (values ('acidity'), ('sweetness'), ('body'), ('finish'), ('bitterness'), ('balance')),
cmp as (
  select s.legacy_id as id, internal.name_of(s.owner_id) as who, s.created_at, s.updated_at,
         not (a.payload ? 'tasted') as legacy,
         coalesce(cardinality(s.tasted), 0) as n_tasted,
         (select count(*) from k where internal.try_num(a.payload->>k.key) is not null) as n_sheet,
         (select count(*) from k where internal.try_num(a.payload->>k.key) is not null and internal.try_num(a.payload->>k.key) <> 5) as n_sheet_set,
         (select count(*) from k where internal.try_num(s.taste->>k.key) is not null and internal.try_num(s.taste->>k.key) <> 5) as n_db_set,
         (select count(*) from k where internal.try_num(a.payload->>k.key) is distinct from internal.try_num(s.taste->>k.key)) as n_diff
  from sessions s join arch a on a.lid = s.legacy_id
  where s.deleted_at is null
)
select 'per person: sessions from the Sheet / saved before the slider list (v10) / those showing no sliders now / taste differs from the Sheet / of those, flattened to 5' as heading
union all
select who || ': ' || count(*) || ' / ' || count(*) filter (where legacy) || ' / ' || count(*) filter (where legacy and n_tasted = 0 and n_db_set > 0)
       || ' / ' || count(*) filter (where n_diff > 0) || ' / ' || count(*) filter (where n_diff > 0 and n_db_set = 0 and n_sheet_set > 0)
from cmp group by who
union all
select 'differs from the Sheet: ' || coalesce(string_agg(id || ' (' || who || case when n_db_set = 0 and n_sheet_set > 0 then ', all 5 now' else '' end || ', edited ' || to_char(updated_at at time zone 'America/Chicago', 'Mon DD') || ')', ', ' order by updated_at), 'none')
from cmp where n_diff > 0
union all
select 'sessions made since the move with no slider list but values set: ' || count(*)
from sessions s where s.deleted_at is null and not exists (select 1 from arch a where a.lid = s.legacy_id)
  and coalesce(cardinality(s.tasted), 0) = 0
  and exists (select 1 from k where internal.try_num(s.taste->>k.key) is not null and internal.try_num(s.taste->>k.key) <> 5)
union all
select 'moved to accounts: ' || coalesce((select value from backend_state where key = 'cutover_at'), 'not yet');
