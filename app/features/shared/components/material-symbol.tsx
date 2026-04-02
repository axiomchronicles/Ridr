type MaterialSymbolProps = {
  name: string;
  className?: string;
  filled?: boolean;
};

export function MaterialSymbol({
  name,
  className,
  filled = false,
}: MaterialSymbolProps) {
  return (
    <span
      className={["material-symbol", className].filter(Boolean).join(" ")}
      style={{
        fontVariationSettings: filled
          ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24",
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
