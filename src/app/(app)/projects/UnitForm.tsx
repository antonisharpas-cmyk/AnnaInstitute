import Link from "next/link";
import type { units as unitsTable } from "@/db/schema";
import type { MessageKey } from "@/i18n";
import { amountForInput } from "@/lib/money";

type Unit = typeof unitsTable.$inferSelect;

export default function UnitForm({
  action,
  unit,
  cancelHref,
  t,
}: {
  action: (formData: FormData) => void | Promise<void>;
  unit?: Unit;
  cancelHref: string;
  t: (key: MessageKey) => string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label" htmlFor="code">
            {t("units.code")}
          </label>
          <input
            id="code"
            name="code"
            required
            defaultValue={unit?.code ?? ""}
            placeholder="A101"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="floor">
            {t("units.floor")}
          </label>
          <input id="floor" name="floor" defaultValue={unit?.floor ?? ""} className="input" />
        </div>

        <div>
          <label className="label" htmlFor="bedrooms">
            {t("units.bedrooms")}
          </label>
          <input
            id="bedrooms"
            name="bedrooms"
            type="number"
            min="0"
            defaultValue={unit?.bedrooms ?? ""}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="coveredArea">
            {t("units.covered")}
          </label>
          <input
            id="coveredArea"
            name="coveredArea"
            defaultValue={unit?.coveredArea ? Number(unit.coveredArea) : ""}
            placeholder="84"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="verandaArea">
            {t("units.veranda")}
          </label>
          <input
            id="verandaArea"
            name="verandaArea"
            defaultValue={unit?.verandaArea ? Number(unit.verandaArea) : ""}
            placeholder="18"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="roofGardenArea">
            {t("units.roofGarden")}
          </label>
          <input
            id="roofGardenArea"
            name="roofGardenArea"
            defaultValue={unit?.roofGardenArea ? Number(unit.roofGardenArea) : ""}
            placeholder="0"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="parkingSpaces">
            {t("units.parking")}
          </label>
          <input
            id="parkingSpaces"
            name="parkingSpaces"
            type="number"
            min="0"
            defaultValue={unit?.parkingSpaces ?? 1}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="netPrice">
            {t("units.netPrice")}
          </label>
          <input
            id="netPrice"
            name="netPrice"
            required
            defaultValue={unit ? amountForInput(unit.netPrice) : ""}
            placeholder="150000"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="status">
            {t("common.status")}
          </label>
          <select
            id="status"
            name="status"
            defaultValue={unit?.status ?? "AVAILABLE"}
            className="select"
          >
            <option value="AVAILABLE">{t("units.status.AVAILABLE")}</option>
            <option value="RESERVED">{t("units.status.RESERVED")}</option>
            <option value="SOLD">{t("units.status.SOLD")}</option>
            <option value="DELIVERED">{t("units.status.DELIVERED")}</option>
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="notes">
            {t("common.notes")}
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={unit?.notes ?? ""}
            className="textarea"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-brand-line pt-4">
        <button type="submit" className="btn btn-primary">
          {t("common.save")}
        </button>
        <Link href={cancelHref} className="btn btn-secondary">
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
