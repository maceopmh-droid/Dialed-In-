-- read only (nothing this run)
select 'now ' || to_char(now() at time zone 'America/Chicago', 'MM-DD HH24:MI') || ' Chicago';
