import { useState } from "react";
import Select from "react-select";

export type PartOption = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
};

interface PartSelectorProps {
  name: string;
  parts: PartOption[];
  defaultValue?: string;
  required?: boolean;
}

export function PartSelector({
  name,
  parts,
  defaultValue,
  required = false,
}: PartSelectorProps) {
  const allOptions = parts.map((p) => ({
    value: p.id,
    label: `${p.sku} — ${p.name}`,
    barcode: p.barcode,
    sku: p.sku,
    name: p.name,
    categoryName: p.categoryName || "Uncategorized",
  }));

  const groupedOptionsMap = allOptions.reduce(
    (acc, curr) => {
      if (!acc[curr.categoryName]) {
        acc[curr.categoryName] = [];
      }
      acc[curr.categoryName].push(curr);
      return acc;
    },
    {} as Record<string, typeof allOptions>,
  );

  const options = Object.entries(groupedOptionsMap).map(([label, opts]) => ({
    label,
    options: opts,
  }));

  const initialValue = allOptions.find((o) => o.value === defaultValue) || null;
  const [selected, setSelected] = useState<{ value: string } | null>(
    initialValue,
  );

  const customFilter = (
    option: { label: string; data: any },
    rawInput: string,
  ) => {
    const input = rawInput.toLowerCase();
    if (!input) return true;

    // Check against label, sku, name, and barcode
    return (
      option.data.name.toLowerCase().includes(input) ||
      option.data.sku.toLowerCase().includes(input) ||
      (option.data.barcode && option.data.barcode.toLowerCase() === input)
    );
  };

  return (
    <div style={{ position: "relative", zIndex: 10 }}>
      {/* Hidden input for Remix form submission */}
      <input type="hidden" name={name} value={selected ? selected.value : ""} />
      <Select
        options={options}
        defaultValue={initialValue}
        onChange={(val) => setSelected(val as { value: string } | null)}
        filterOption={customFilter}
        placeholder="Search by name, SKU, or scan barcode..."
        isClearable
        required={required && !selected}
        styles={{
          control: (base, state) => ({
            ...base,
            padding: "0.2rem",
            borderRadius: "999px",
            borderColor: state.isFocused ? "var(--primary)" : "var(--line)",
            boxShadow: state.isFocused
              ? "0 0 0 3px rgba(16, 185, 129, 0.12)"
              : "none",
            "&:hover": {
              borderColor: "var(--primary)",
            },
          }),
          menu: (base) => ({
            ...base,
            borderRadius: "16px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
            overflow: "hidden",
            border: "1px solid var(--line)",
          }),
          groupHeading: (base) => ({
            ...base,
            color: "var(--muted)",
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "0.75rem 1rem 0.25rem",
          }),
          option: (base, state) => ({
            ...base,
            padding: "0.5rem 1rem",
            backgroundColor: state.isSelected
              ? "var(--primary)"
              : state.isFocused
                ? "var(--mint)"
                : "white",
            color: state.isSelected ? "white" : "var(--ink)",
            "&:active": {
              backgroundColor: "var(--primary)",
            },
          }),
        }}
      />
    </div>
  );
}
