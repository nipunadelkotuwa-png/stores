import { useState } from "react";
import Select from "react-select";

export type PartOption = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  categoryId?: string | null;
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
  const options = parts.map((p) => ({
    value: p.id,
    label: `${p.sku} — ${p.name}`,
    barcode: p.barcode,
    sku: p.sku,
    name: p.name,
  }));

  const initialValue = options.find((o) => o.value === defaultValue) || null;
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
            boxShadow: state.isFocused ? "0 0 0 3px rgba(16, 185, 129, 0.12)" : "none",
            "&:hover": {
              borderColor: "var(--primary)",
            },
          }),
          menu: (base) => ({
            ...base,
            borderRadius: "16px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
            overflow: "hidden",
            border: "1px solid var(--line)"
          }),
          option: (base, state) => ({
            ...base,
            backgroundColor: state.isSelected ? "var(--primary)" : state.isFocused ? "var(--mint)" : "white",
            color: state.isSelected ? "white" : "var(--ink)",
            "&:active": {
              backgroundColor: "var(--primary)",
            }
          })
        }}
      />
    </div>
  );
}
