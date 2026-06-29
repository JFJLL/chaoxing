type KnowledgeNode = {
  id: string;
  label: string;
  type: string;
  summary?: string | null;
  order: number;
};

type KnowledgeEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label?: string | null;
};

const levelByType: Record<string, number> = {
  course: 0,
  chapter: 1,
  lesson: 2,
  concept: 3,
  skill: 3,
  case: 3,
  assessment: 3
};

const colorByType: Record<string, { fill: string; stroke: string; text: string }> = {
  course: { fill: "#eff6ff", stroke: "#2563eb", text: "#1e3a8a" },
  chapter: { fill: "#f0fdf4", stroke: "#16a34a", text: "#14532d" },
  lesson: { fill: "#fff7ed", stroke: "#f97316", text: "#7c2d12" },
  concept: { fill: "#faf5ff", stroke: "#a855f7", text: "#581c87" },
  skill: { fill: "#ecfeff", stroke: "#0891b2", text: "#164e63" },
  case: { fill: "#fdf2f8", stroke: "#db2777", text: "#831843" },
  assessment: { fill: "#fefce8", stroke: "#ca8a04", text: "#713f12" }
};

function label(value: string, max = 16) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    course: "课程",
    chapter: "章节",
    lesson: "课时",
    concept: "知识点",
    skill: "技能",
    case: "案例",
    assessment: "评价"
  };
  return labels[type] ?? type;
}

export function KnowledgeMapGraph({ nodes, edges }: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }) {
  const grouped = new Map<number, KnowledgeNode[]>();
  for (const node of nodes) {
    const level = levelByType[node.type] ?? 4;
    grouped.set(level, [...(grouped.get(level) ?? []), node]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const levels = Array.from(grouped.keys()).sort((a, b) => a - b);
  const maxRows = Math.max(1, ...Array.from(grouped.values()).map((items) => items.length));
  const width = Math.max(760, levels.length * 250 + 80);
  const height = Math.max(360, maxRows * 110 + 80);

  levels.forEach((level) => {
    const items = (grouped.get(level) ?? []).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN"));
    const columnHeight = (items.length - 1) * 110;
    const startY = Math.max(60, (height - columnHeight) / 2);
    items.forEach((node, index) => {
      positions.set(node.id, { x: 60 + level * 250, y: startY + index * 110 });
    });
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-4">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="课程知识导图">
        <defs>
          <marker id="knowledge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const source = positions.get(edge.sourceId);
          const target = positions.get(edge.targetId);
          if (!source || !target) return null;
          const startX = source.x + 180;
          const startY = source.y + 28;
          const endX = target.x;
          const endY = target.y + 28;
          const midX = (startX + endX) / 2;
          return (
            <g key={edge.id}>
              <path
                d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                markerEnd="url(#knowledge-arrow)"
              />
              {edge.label ? (
                <text x={midX - 20} y={(startY + endY) / 2 - 6} fill="#64748b" fontSize="11">
                  {label(edge.label, 8)}
                </text>
              ) : null}
            </g>
          );
        })}
        {nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const color = colorByType[node.type] ?? { fill: "#f8fafc", stroke: "#64748b", text: "#334155" };
          return (
            <g key={node.id} transform={`translate(${position.x}, ${position.y})`}>
              <rect width="180" height="56" rx="10" fill={color.fill} stroke={color.stroke} strokeWidth="1.5" />
              <text x="14" y="23" fill={color.text} fontSize="13" fontWeight="600">
                {label(node.label)}
              </text>
              <text x="14" y="42" fill="#64748b" fontSize="11">
                {typeLabel(node.type)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
