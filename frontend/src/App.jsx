import { useState } from 'react'
import { investigateByAPI } from './api/client'
import DualEntryGateway from './components/DualEntryGateway'
import LoadingScreen from './components/LoadingScreen'
import InvestigationView from './components/InvestigationView'

export default function App() {
  const [screen, setScreen]               = useState('gateway')
  const [investigationData, setData]      = useState(null)
  const [error, setError]                 = useState(null)
  const [lastCrn, setLastCrn]             = useState('')

  async function handleInvestigateAPI(crn) {
    setScreen('loading')
    setError(null)
    setData(null)
    setLastCrn(crn)
    try {
      const result = await investigateByAPI(crn)
      setData(result)
      setScreen('results')
    } catch (err) {
      setError(err.message)
      setScreen('gateway')
    }
  }

  function handleReset() {
    setScreen('gateway')
    setData(null)
    setError(null)
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {screen === 'gateway' && (
        <DualEntryGateway 
          onInvestigateAPI={handleInvestigateAPI} 
          error={error} 
          onErrorClear={() => setError(null)}
        />
      )}
      {screen === 'loading' && <LoadingScreen crn={lastCrn} />}
      {screen === 'results' && (
        <InvestigationView
          key={investigationData?.thread_id}
          data={investigationData}
          crn={lastCrn}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
