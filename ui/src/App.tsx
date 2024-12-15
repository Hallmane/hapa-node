// provider/ui/src/App.tsx

//@ts-ignore
import { GetProviderData } from "./components/GetProviderData";
//@ts-ignore
import { RegisterAPI } from "./components/RegisterAPI";
//@ts-ignore
import { SetOnlineStatus } from "./components/SetOnlineStatus";
//@ts-ignore
import { CHAIN } from "./shared_imports";
import { ProviderDashboard } from "./components/ProviderDashboard";
import { useEffect, useState } from "react";

function App() {
  //const [ourAddress, setOurAddress] = useState<string>("");

  //useEffect(() => {
  //  const address = localStorage.getItem("our_address");
  //  console.log("address", address);
  //  if (address) {
  //    setOurAddress(address);
  //  }
  //}, []);

  return (
    <div>
    
      {/* Header */}
      <div style={{
        color: '#9CA3AF',
        fontSize: '0.875rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: '0.05em',
        fontWeight: 500,
        textTransform: 'lowercase',
        marginBottom: '3rem',
        textAlign: 'right'
      }}>
        embedding provider {(window as any).our?.node}
      </div>
      <ProviderDashboard />
      {/*<div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Our Address</h2>
        <p className="text-gray-700">{ourAddress}</p>
      </div>*/}
      {/*<RegisterAPI setOurAddress={setOurAddress} />*/}
      {/*<GetProviderData ourAddress={ourAddress} />*/}
      {/*<SetOnlineStatus />*/}
    </div>
  );
}

export default App;
