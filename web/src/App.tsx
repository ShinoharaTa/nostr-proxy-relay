import './App.css'

function App() {
  return (
    <>
      <h1>Proxy Nostr Relay</h1>
      <p>/config 管理画面（Basic認証）</p>
      <ul>
        <li>Relay設定: <code>/api/relay</code></li>
        <li>Safelist: <code>/api/safelist</code></li>
        <li>Filters: <code>/api/filters</code>, <code>/api/filters/parse</code></li>
      </ul>
    </>
  )
}

export default App
