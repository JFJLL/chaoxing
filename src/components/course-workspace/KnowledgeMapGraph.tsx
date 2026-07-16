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

type NodeStyle = {
  fill: string;
  stroke: string;
  text: string;
  soft: string;
};

const levelByType: Record<string, number> = {
  course: 0,
  objective: 1,
  chapter: 1,
  lesson: 2,
  concept: 3,
  activity: 4,
  skill: 4,
  case: 4,
  assessment: 4
};

const styleByType: Record<string, NodeStyle> = {
  course: { fill: "#eff6ff", stroke: "#2563eb", text: "#1e3a8a", soft: "#dbeafe" },
  objective: { fill: "#ecfdf5", stroke: "#059669", text: "#064e3b", soft: "#d1fae5" },
  chapter: { fill: "#f0fdf4", stroke: "#16a34a", text: "#14532d", soft: "#dcfce7" },
  lesson: { fill: "#fff7ed", stroke: "#f97316", text: "#7c2d12", soft: "#ffedd5" },
  concept: { fill: "#faf5ff", stroke: "#a855f7", text: "#581c87", soft: "#f3e8ff" },
  activity: { fill: "#ecfeff", stroke: "#0891b2", text: "#164e63", soft: "#cffafe" },
  skill: { fill: "#ecfeff", stroke: "#0891b2", text: "#164e63", soft: "#cffafe" },
  case: { fill: "#fdf2f8", stroke: "#db2777", text: "#831843", soft: "#fce7f3" },
  assessment: { fill: "#fefce8", stroke: "#ca8a04", text: "#713f12", soft: "#fef9c3" }
};

const edgeStrokeByType: Record<string, string> = {
  contains: "#94a3b8",
  outcome: "#10b981",
  precedes: "#64748b",
  relates: "#a855f7",
  practice: "#0891b2",
  applies: "#0ea5e9",
  checks: "#ca8a04",
  evaluates: "#f59e0b"
};

const levelLabels = ["课程", "目标 / 章节", "课时", "核心概念", "活动 / 评价"];

function label(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function wrapLabel(value: string, max = 13) {
  const chunks: string[] = [];
  let rest = value.trim();
  while (rest.length > max && chunks.length < 2) {
    chunks.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  if (rest) chunks.push(chunks.length >= 2 && rest.length > max ? `${rest.slice(0, max - 1)}...` : rest);
  return chunks.slice(0, 3);
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    course: "课程",
    objective: "目标",
    chapter: "章节",
    lesson: "课时",
    concept: "概念",
    activity: "活动",
    skill: "技能",
    case: "案例",
    assessment: "评价"
  };
  return labels[type] ?? type;
}

function edgeLabel(type: string) {
  const labels: Record<string, string> = {
    contains: "结构",
    outcome: "目标",
    precedes: "先后",
    relates: "递进",
    practice: "实践",
    applies: "应用",
    checks: "检测",
    evaluates: "评价"
  };
  return labels[type] ?? type;
}

export function KnowledgeMapGraph({ nodes, edges }: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }) {
  const grouped = new Map<number, KnowledgeNode[]>();
  for (const node of nodes) {
    const level = levelByType[node.type] ?? 4;
    grouped.set(level, [...(grouped.get(level) ?? []), node]);
  }

  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
  const levels = Array.from(new Set([0, ...Array.from(grouped.keys())])).sort((a, b) => a - b);
  const nodeWidth = 220;
  const nodeHeight = 82;
  const gapX = 92;
  const gapY = 34;
  const top = 96;
  const left = 48;
  const maxRows = Math.max(1, ...Array.from(grouped.values()).map((items) => items.length));
  const width = Math.max(980, levels.length * (nodeWidth + gapX) + left * 2);
  const height = Math.max(520, top + maxRows * (nodeHeight + gapY) + 86);

  levels.forEach((level) => {
    const items = (grouped.get(level) ?? []).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN"));
    const columnHeight = items.length * nodeHeight + Math.max(0, items.length - 1) * gapY;
    const startY = Math.max(top, top + (height - top - 92 - columnHeight) / 2);
    items.forEach((node, index) => {
      positions.set(node.id, {
        x: left + level * (nodeWidth + gapX),
        y: startY + index * (nodeHeight + gapY),
        width: nodeWidth,
        height: nodeHeight
      });
    });
  });

  return (
    <div className="overflow-x-auto rounded-[28px] border border-slate-100 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="课程知识图谱">
        <defs>
          <marker id="knowledge-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L9,4.5 L0,9 Z" fill="#94a3b8" />
          </marker>
          <filter id="node-shadow" x="-12%" y="-18%" width="124%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#334155" floodOpacity="0.12" />
          </filter>
        </defs>

        {levels.map((level) => (
          <g key={`lane-${level}`}>
            <rect x={left + level * (nodeWidth + gapX) - 18} y="52" width={nodeWidth + 36} height={height - 94} rx="24" fill="#ffffff" opacity="0.58" />
            <text x={left + level * (nodeWidth + gapX)} y="38" fill="#64748b" fontSize="13" fontWeight="700">
              {levelLabels[level] ?? `层级 ${level}`}
            </text>
          </g>
        ))}

        {edges.map((edge) => {
          const source = positions.get(edge.sourceId);
          const target = positions.get(edge.targetId);
          if (!source || !target) return null;
          const startX = source.x + source.width;
          const startY = source.y + source.height / 2;
          const endX = target.x;
          const endY = target.y + target.height / 2;
          const sameColumn = Math.abs(startX - endX) < 80;
          const midX = sameColumn ? startX + 28 : (startX + endX) / 2;
          const stroke = edgeStrokeByType[edge.type] ?? "#94a3b8";
          const dash = edge.type === "precedes" || edge.type === "relates" ? "6 6" : undefined;
          const path = sameColumn
            ? `M ${source.x + source.width / 2} ${source.y + source.height} C ${source.x + source.width / 2} ${source.y + source.height + 24}, ${target.x + target.width / 2} ${target.y - 24}, ${target.x + target.width / 2} ${target.y}`
            : `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
          const labelX = sameColumn ? source.x + source.width / 2 + 12 : midX - 18;
          const labelY = sameColumn ? (source.y + target.y + source.height) / 2 : (startY + endY) / 2 - 8;
          return (
            <g key={edge.id}>
              <path d={path} fill="none" stroke={stroke} strokeDasharray={dash} strokeWidth="1.8" markerEnd="url(#knowledge-arrow)" opacity="0.78" />
              <text x={labelX} y={labelY} fill={stroke} fontSize="11" fontWeight="700">
                {label(edge.label || edgeLabel(edge.type), 8)}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const color = styleByType[node.type] ?? { fill: "#f8fafc", stroke: "#64748b", text: "#334155", soft: "#e2e8f0" };
          const lines = wrapLabel(node.label);
          return (
            <g key={node.id} transform={`translate(${position.x}, ${position.y})`} filter="url(#node-shadow)">
              <rect width={position.width} height={position.height} rx="16" fill={color.fill} stroke={color.stroke} strokeWidth="1.4" />
              <rect x="14" y="14" width="44" height="24" rx="12" fill={color.soft} />
              <text x="36" y="30" textAnchor="middle" fill={color.text} fontSize="12" fontWeight="800">
                {typeLabel(node.type)}
              </text>
              <text x="72" y="27" fill={color.text} fontSize="14" fontWeight="800">
                {lines[0]}
              </text>
              {lines[1] ? (
                <text x="72" y="47" fill={color.text} fontSize="14" fontWeight="800">
                  {lines[1]}
                </text>
              ) : null}
              <text x="16" y="68" fill="#64748b" fontSize="11">
                {node.summary ? label(node.summary, 28) : "等待补充说明"}
              </text>
            </g>
          );
        })}

        <g transform={`translate(${left}, ${height - 36})`}>
          {["outcome", "contains", "precedes", "applies", "checks"].map((type, index) => (
            <g key={type} transform={`translate(${index * 112}, 0)`}>
              <line x1="0" y1="0" x2="28" y2="0" stroke={edgeStrokeByType[type]} strokeWidth="2" strokeDasharray={type === "precedes" ? "6 6" : undefined} />
              <text x="36" y="4" fill="#64748b" fontSize="12" fontWeight="700">
                {edgeLabel(type)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
