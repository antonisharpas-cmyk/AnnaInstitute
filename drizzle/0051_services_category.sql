-- Services, a kind of invoice of its own under Company.
ALTER TYPE "expense_category" ADD VALUE IF NOT EXISTS 'SERVICES' BEFORE 'OTHER';
