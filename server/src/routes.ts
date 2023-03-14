import dayjs from "dayjs"
import { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../prisma/lib/prisma"

export async function appRoutes(app: FastifyInstance) {
  
// Rota de criação de um Hábito novo!
app.post('/habits', async (request) => {
  const createHabitBody = z.object({
    title: z.string(),
    weekDays: z.array(
      z.number().min(0).max(6)
    ),
  })

  const { title, weekDays } = createHabitBody.parse(request.body)

  const today = dayjs().startOf('day').toDate()

  await prisma.habit.create({
    data: {
      title,
      created_at: today,
      weekDays: {
        create: weekDays.map((weekDay) => {
          return {
            week_day: weekDay,
          }
        }),
      }
    }
  })
})


// Rota de detalhes do dia (hábitos completos / possíveis)!
app.get('/day', async (Request) => {
  const getDayParams = z.object({
    date: z.coerce.date()
  })

  const { date } = getDayParams.parse(Request.query)

  const parsedDate = dayjs(date).startOf('day')
  const weekDay = parsedDate.get('day')

  const possibleHabits = await prisma.habit.findMany({
    where: {
      created_at: {
        lte: date,
      },
      weekDays: {
        some: {
          week_day: weekDay,
        }
      }
    }
  })

  const day = await prisma.day.findUnique({
    where: {
      date: parsedDate.toDate(),
    },
    include: {
      dayHabits: true,
    }
  })

  const completedHabits = day?.dayHabits.map(dayHabit => {
    return dayHabit.habit_id
  }) ?? []

  return{
    possibleHabits,
    completedHabits,
    
  }
})

// Rota de completar e não-completar um hábito!
app.patch('/habits/:id/toggle', async (Request) => {

  const toggleHabitParams = z.object({
    id: z.string().uuid(),
  })

  const { id } = toggleHabitParams.parse(Request.params)

  const today = dayjs().startOf('day').toDate()

  let day = await prisma.day.findUnique({
    where: {
      date: today,
    }
  })

  if (!day) {
    day = await prisma.day.create({
      data: {
        date: today,
      }
    })
  }

  const dayHabit = await prisma.dayHabit.findUnique({
    where: {
      day_id_habit_id: {
        day_id: day.id,
        habit_id: id,
      }
    }
  })

  if (dayHabit) {
    await prisma.dayHabit.delete({
      where: {
        id: dayHabit.id,
      }
    })
  } else {
    
  await prisma.dayHabit.create({
    data: {
      day_id: day.id,
      habit_id: id,
    }
  })
  }
})

// Rota de resumo de dias!
app.get('/summary', async () => {
  const summary = await prisma.$queryRaw`
    SELECT 
      D.id, 
      D.date,
      (
        SELECT 
         cast(count(*) as float)  
        FROM day_habits DH
        WHERE DH.day_id = D.id
      ) as completed,
      (
        SELECT 
         cast(count(*) as float) 
         FROM habit_week_days HWD
         JOIN habits H 
          ON  H.id = HWD.habit_id
         WHERE
          HWD.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch') as int)
          AND H.created_at <= D.date 
      ) as amount

    FROM days D
  `
  
  return summary
})
}
