import { IsString } from 'class-validator';

/** A public holiday, as the holidays API answers it. */
export class Holiday {
  @IsString()
  date!: string;
  @IsString()
  name!: string;

  constructor(values: Partial<Holiday> = {}) {
    Object.assign(this, values);
  }
}
