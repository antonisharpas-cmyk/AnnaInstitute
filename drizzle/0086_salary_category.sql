-- Salary, a kind of expense with no invoice: the office records what it paid each employee.
ALTER TYPE "public"."expense_category" ADD VALUE IF NOT EXISTS 'SALARY' BEFORE 'OTHER';
