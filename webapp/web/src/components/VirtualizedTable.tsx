import * as React from "react";

type Props<T> = {
  items: T[];
  rowHeight?: number;
  height?: number;
  renderRow: (item: T, idx: number) => React.ReactNode;
  header?: React.ReactNode;
  overscan?: number;
};

export function VirtualizedTable<T>({ items, rowHeight = 40, height = 500, renderRow, header, overscan = 8 }: Props<T>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop);
  const totalHeight = items.length * rowHeight;
  const viewportCount = Math.ceil(height / rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, start + viewportCount + overscan * 2);
  const slice = items.slice(start, end);
  const offsetY = start * rowHeight;
  return (
    <div>
      {header && <div className="sticky top-0 z-10 bg-background">{header}</div>}
      <div ref={ref} onScroll={onScroll} style={{ height, overflowY: "auto", border: "1px solid hsl(var(--border))" }} className="rounded-md">
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ transform: `translateY(${offsetY}px)`, position: "absolute", left: 0, right: 0, top: 0 }}>
            {slice.map((it, i) => (
              <div key={start + i} style={{ height: rowHeight }} className="border-b flex items-center px-2 text-sm overflow-hidden transition-colors duration-150 hover:bg-muted/40">
                {renderRow(it, start + i)}
              </div>
            ))}
            {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">No results</div>}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{items.length} rows · virtualized window {start}-{end}</div>
    </div>
  );
}
