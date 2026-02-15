'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const data = [
  { name: 'モバイル', value: 3056, percent: 54.3, color: '#206bc4' },
  { name: 'デスクトップ', value: 2524, percent: 44.8, color: '#2fb344' },
  { name: 'タブレット', value: 49, percent: 0.9, color: '#f59f00' },
]

export default function DeviceChart() {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">📱 デバイス別分布</h3>
      </div>
      <div className="card-body">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()}クリック`,
                  name
                ]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-gray-600">{item.name}</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">{item.percent}%</span>
                <span className="text-gray-400 ml-2">({item.value.toLocaleString()})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
