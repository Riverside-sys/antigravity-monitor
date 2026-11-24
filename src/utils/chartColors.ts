// 蓝色为主导、柔和协调的数据可视化调色板（对齐参考设计图）
export const CHART_SERIES_COLORS = [
  '#3B82F6', // 鲜明蓝（主柱色）
  '#60A5FA', // 亮天蓝
  '#2563EB', // 深钴蓝
  '#38BDF8', // 青蓝
  '#6366F1', // 靛蓝
  '#93C5FD', // 柔和浅蓝
  '#0EA5E9', // 湖蓝
  '#818CF8', // 浅靛蓝
];

export function getSeriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}
