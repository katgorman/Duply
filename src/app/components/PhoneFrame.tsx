interface PhoneFrameProps {
  children: React.ReactNode;
}

export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="relative">
        {/* iPhone Frame */}
        <div className="relative w-[375px] h-[812px] bg-black rounded-[50px] shadow-2xl p-3">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[180px] h-[30px] bg-black rounded-b-3xl z-50"></div>
          
          {/* Screen */}
          <div className="relative w-full h-full bg-white rounded-[42px] overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
