import { Hono } from 'hono'
import erdHtml from './erd-html'

const app = new Hono()

app.get('/', (c) => c.redirect('/erd'))

app.get('/erd', (c) => {
  return c.html(erdHtml)
})

export default app
