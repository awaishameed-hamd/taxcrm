-- AddForeignKey: SalesTaxReturn.taskId → SalesTaxTask with CASCADE
ALTER TABLE "sales_tax_returns" ADD CONSTRAINT "sales_tax_returns_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "sales_tax_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: IncomeTaxReturn.taskId → SalesTaxTask with CASCADE
ALTER TABLE "income_tax_returns" ADD CONSTRAINT "income_tax_returns_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "sales_tax_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
