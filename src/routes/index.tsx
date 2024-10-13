import { createFileRoute } from "@tanstack/react-router"

const HomePage = () => {
  return (
    <div>
      <h1>Home Page</h1>
    </div>
  )
}

export const Route = createFileRoute("/")({
  component: HomePage,
})
