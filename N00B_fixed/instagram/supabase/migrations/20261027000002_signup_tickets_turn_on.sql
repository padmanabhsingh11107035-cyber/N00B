-- NOOB — turns the sign-up ticket rule ON (see 20261027000001_signup_tickets.sql).
--
-- Run this ONLY after the recover-account function has been redeployed with the ticket change: from this moment a new email / phone /
-- anonymous login is refused unless the emailed-code flow wrote its ticket first. If it is ever needed, the rule goes away again with:
--     drop trigger if exists noob_block_direct_signup on auth.users;

drop trigger if exists noob_block_direct_signup on auth.users;
create trigger noob_block_direct_signup
  before insert on auth.users
  for each row execute function public.noob_block_direct_signup();
