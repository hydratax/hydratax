"use client";

import type { StructuredAddress } from "@/lib/ch-wizard-shared";

export function ChAddressFields({
  value,
  onChange,
  idPrefix,
}: {
  value: StructuredAddress;
  onChange: (next: StructuredAddress) => void;
  idPrefix: string;
}) {
  function patch(partial: Partial<StructuredAddress>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="label sm:col-span-2">
        Building name or number
        <input
          id={`${idPrefix}-premise`}
          className="input mt-1.5"
          value={value.premise}
          onChange={(e) => patch({ premise: e.target.value })}
          autoComplete="address-line1"
          required
        />
      </label>
      <label className="label sm:col-span-2">
        Street
        <input
          id={`${idPrefix}-street`}
          className="input mt-1.5"
          value={value.street}
          onChange={(e) => patch({ street: e.target.value })}
          autoComplete="address-line2"
          required
        />
      </label>
      <label className="label">
        Town or city
        <input
          id={`${idPrefix}-postTown`}
          className="input mt-1.5"
          value={value.postTown}
          onChange={(e) => patch({ postTown: e.target.value })}
          autoComplete="address-level2"
          required
        />
      </label>
      <label className="label">
        County (optional)
        <input
          id={`${idPrefix}-county`}
          className="input mt-1.5"
          value={value.county}
          onChange={(e) => patch({ county: e.target.value })}
          autoComplete="address-level1"
        />
      </label>
      <label className="label">
        Postcode
        <input
          id={`${idPrefix}-postcode`}
          className="input mt-1.5 mono uppercase"
          value={value.postcode}
          onChange={(e) =>
            patch({ postcode: e.target.value.toUpperCase() })
          }
          autoComplete="postal-code"
          required
        />
      </label>
      <label className="label">
        Country
        <select
          id={`${idPrefix}-country`}
          className="input mt-1.5"
          value={value.country}
          onChange={(e) => patch({ country: e.target.value })}
        >
          <option value="GBR">United Kingdom</option>
          <option value="IRL">Ireland</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
    </div>
  );
}
