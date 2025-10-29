import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import ChatBox from "@/components/chat/chat-box"
import Navbar from "@/components/Navbar"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
    <Navbar />
    <SidebarProvider>
      <AppSidebar /> {/* Sidebar bên phải – đã đặt ChatBox bên trong */}
      <main className="flex-1">
        <div className="p-4 h-full">
          <SidebarTrigger />
          <ChatBox />
        </div>
      </main>
    </SidebarProvider>
    </>
  )
}
