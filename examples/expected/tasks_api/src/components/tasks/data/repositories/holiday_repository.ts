import { Holiday } from '../../domain/models/holiday.js';
import { Injectable } from '@nestjs/common';
import { AppError, HttpRepository, Result } from 'dragonfly-nest';

/** The public holidays of a country (an HTTP repository: another API, ADR-0103), to warn when a task is due on one. */
@Injectable()
export class HolidayRepository extends HttpRepository {
  override path = 'PublicHolidays';

  async of(year: number, country: string): Promise<Result<AppError, Holiday[]>> {
    return this.send('GET', ':year/:country', { year, country });
  }
}
