import { useEffect, useState } from "react"

export default function Block({ block }: any) {

  const [text, setText] = useState(
  block?.get ? block.get("content") : ""
)

  useEffect(() => {
    const update = () => {
      setText(block.get("content"))
    }

    block.observe(update)

    return () => {
      block.unobserve(update)
    }
  }, [block])

  const handleChange = (e: any) => {
  if (!block?.set) return
  block.set("content", e.target.value)
}

  return (
    <div style={{ marginBottom: "10px" }}>
      <input
        value={text}
        onChange={handleChange}
        placeholder="Type here..."
        style={{
          width: "100%",
          fontSize: "16px",
          padding: "5px",
        }}
      />
    </div>
  )
}