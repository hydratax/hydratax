"use client";

import { useEffect, useId, useState } from "react";
import {
  formatAddressParts,
  parseAddressParts,
  type AddressParts,
} from "@/lib/address-parts";

/** Four address boxes; writes one hidden JSON field for form submits. */
export function AddressFields({
  name = "address",
  defaultValue,
  value,
  onChange,
  required = false,
  streetId,
  postcodeId,
}: {
  name?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (serialized: string) => void;
  /** When true, street and postcode are compulsory. */
  required?: boolean;
  /** Stable ids for scroll/focus from validation errors. */
  streetId?: string;
  postcodeId?: string;
}) {
  const uid = useId();
  const controlled = value !== undefined && onChange != null;
  const [parts, setParts] = useState<AddressParts>(() =>
    parseAddressParts(controlled ? value : defaultValue),
  );

  useEffect(() => {
    if (controlled) setParts(parseAddressParts(value));
  }, [controlled, value]);

  function update(patch: Partial<AddressParts>) {
    const next = { ...parts, ...patch };
    setParts(next);
    onChange?.(formatAddressParts(next));
  }

  const serialized = formatAddressParts(parts);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={serialized} readOnly />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold sm:col-span-2">
          Street address{required ? " *" : ""}
          <input
            id={streetId ?? `${uid}-street`}
            className="input mt-1.5 w-full font-normal"
            autoComplete="street-address"
            placeholder="Building and street"
            required={required}
            value={parts.street}
            onChange={(e) => update({ street: e.target.value })}
          />
        </label>
        <label className="block text-sm font-semibold">
          City
          <input
            id={`${uid}-city`}
            className="input mt-1.5 w-full font-normal"
            autoComplete="address-level2"
            placeholder="Town or city"
            value={parts.city}
            onChange={(e) => update({ city: e.target.value })}
          />
        </label>
        <label className="block text-sm font-semibold">
          Postcode{required ? " *" : ""}
          <input
            id={postcodeId ?? `${uid}-postcode`}
            className="input mt-1.5 w-full font-normal uppercase"
            autoComplete="postal-code"
            placeholder="SW1A 1AA"
            required={required}
            value={parts.postcode}
            onChange={(e) => update({ postcode: e.target.value })}
          />
        </label>
        <label className="block text-sm font-semibold sm:col-span-2">
          Country
          <input
            id={`${uid}-country`}
            className="input mt-1.5 w-full font-normal"
            autoComplete="country-name"
            placeholder="United Kingdom"
            value={parts.country}
            onChange={(e) => update({ country: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
