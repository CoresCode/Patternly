/// <reference types="vite/client" />

declare module '*.csv?raw' {
  const contents: string
  export default contents
}
