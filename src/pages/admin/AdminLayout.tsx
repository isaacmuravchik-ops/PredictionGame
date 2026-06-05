import { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Header } from '../../components/Header'

export function AdminLayout({ children }: { children: ReactNode }) {
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      isActive
        ? 'border-green-700 text-green-700'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <>
      <Header />
      <div className="bg-white border-b border-gray-200 sticky top-[52px] z-10">
        <div className="max-w-4xl mx-auto px-4 flex gap-1">
          <NavLink to="/admin/results" className={linkCls}>Results</NavLink>
          <NavLink to="/admin/fixtures" className={linkCls}>Fixtures</NavLink>
          <NavLink to="/admin/data" className={linkCls}>Data</NavLink>
        </div>
      </div>
      <main className="max-w-4xl mx-auto px-4 py-4">
        {children}
      </main>
    </>
  )
}
