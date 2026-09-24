-- V8.8.0 extension for a compatible V8.7.1 baseline.
-- Apply database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql after the compatible baseline install.
-- This file intentionally documents the second-stage install rather than pretending to bootstrap empty Supabase.
select 'Run database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql on the compatible V8.7.1 baseline.' as instruction;
