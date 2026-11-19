-- Directors NIC method: AN (annual) or AL (alternative).
alter table employees
  add column if not exists directors_nic_method text not null default 'AN';
