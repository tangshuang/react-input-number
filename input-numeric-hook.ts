/**
 * 保留00，因为用户输入过程中00处于被动态，用户随时可能在其前面或后面加值
 *
 * TEST CASES:
 * 122345 -> 122,345
 * 1234567 -> 1,234,567
 * 1234567.111 -> 1,234,567.111
 * 01 -> 1
 * - -> - 支持输入负号
 * -0 -> -0 支持输入-0
 * 0. -> 0. 开始小数输入
 * . -> 0. 输入小数点自动变为0.
 * 2.111 -> 2.111 正常输入小数
 * 2.100 -> 2.100 正常输入末尾的00
 * 00 -> 0 正常输入顺序最多输入一个0
 * 002 -> 2 自动格式化为自然数
 * -003 -> -3 自动格式化为负数
 */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { formatNumberBySeparator, clearNumberZero, isNumeric, isNumber } from 'ts-fns';

type InputNumberOptions = {
  /**
   * 当前给定的原始值
   * 字符串时必须是数字形式的字符串
   * null代表当前无值，一般指输入框内没有任何内容，例如删除光内容之后
   */
  value: number | string | null;
  /**
   * 真实的回调函数，null表示输入框内被删除光，留下空白
   */
  onChange: (value: number | string | null) => void;
  /**
   * 修改光标位置
   */
  setCursor: (cursor: number) => void;
  /**
   * 获取光标位置
   */
  getCursor: () => number;
  /**
   * 最大值
   */
  max?: number;
  /**
   * 最小值
   */
  min?: number;
  /**
   * 位数限制
   * 用.隔开整数和小数部分，例如 '10.2' 代表整数最多10位，小数最多2位，不给表示不限制，例如 '.2' 表示仅限制小数2位，不限制整数
   */
  limit?: string;
  /**
   * 千分位分隔符，默认为‘,’，可以替换为 '_' ' ' 等，但是必须只能是一个字符
   */
  separator?: string;
  /**
   * 是否开启高精度模式，开启后，onChange将接收到字符串作为数值，内部将用字符串作为数值进行处理
   */
  precise?: boolean;
  /**
   * 当内部超出一些限制时，通过该接口获取错误信息
   */
  catchLimit?: (error: {
    /**
     * 错误类型
     */
    type: 'max' | 'min' | 'limit.integer' | 'limit.decimal';
    /**
     * 要求的阈
     */
    range: number;
    /**
     * 实际给的情况
     */
    receive: number | string;
  }) => void;
};

export function useInputNumber<T = {}>(
  options: InputNumberOptions & T,
): T & {
  /**
   * 格式化后的文本数值，用于放到input中作为展示
   */
  numeric: string;
  /**
   * 每次输入后的文本，注意，是格式化后的文本，而不是最终的数值
   * 最终的数值会被传入给options.onChange，对于组件外部而言，拿到的是最终的数值
   */
  onTextChange: (numeric: string) => void;
  /**
   * 主动触发光标变更
   */
  onCursorChange: () => void;
} {
  const {
    value: givenValue,
    onChange: givenOnChange,
    max,
    min,
    limit,
    separator = ',',
    precise,
    setCursor,
    getCursor,
    catchLimit,
  } = options;

  // 需要保留00，不可以删除，否则无法将值再format回字符串
  // 仅在对外onChange时剔除无用的00
  const toNum = (text): string | number => {
    const reg = new RegExp(separator, 'g');
    const num = text.replace(reg, '');
    return num;
  };

  const formatByLimit = (num) => {
    if (!limit) {
      return num;
    }

    const [, deciLimit] = limit.split('.');
    const [integerPart, decimalPart = ''] = `${num}`.split('.');
    let decimal = decimalPart;

    if (deciLimit && decimal.length > +deciLimit) {
      decimal = decimal.substring(0, +deciLimit);
    }

    if (decimal) {
      return `${integerPart}.${decimal}`;
    }
    return integerPart;
  };

  const formatNumber = (num): string => {
    if (num === null) {
      return '';
    }
    return formatNumberBySeparator(formatByLimit(num), separator, 3);
  };

  const createValue = (num) => {
    const numeric = typeof num === 'string' ? clearNumberZero(num) : num;
    if (precise) {
      return numeric;
    }
    return +numeric;
  };

  const countSep = (text) => text.split(separator).length - 1;

  // 光标变更时间，发生变更时会触发光标位移
  // 注意，pos不是当前光标的真实位置，只用于作为判断光标位置发生变化的依据
  const [latestCursorChangedAt, setLatestCursorChangedAt] = useState(0);
  // 当前维持的光标
  // 用于获取在每次变更之前的光标位置
  // cursor不同于pos，它是光标真实值，而且是实时的，任何时候取出应该都是光标的具体位置，因此，外部应该调用onCursorChange去同步cursor的值
  // 每次取出时，实际是上一次修改后的光标位置，通过该位置可以判断新的位置，在内容被更新后，必须同步新的cursor
  const cursor = useRef(getCursor());
  // 当前输入框内部应该呈现的文本内容
  const [text, setText] = useState(() => formatNumber(givenValue));
  // 当前维持的值
  // 用于读取变化前的值，与新值进行对比
  const value = useRef(givenValue);

  // 修改真实值，并返回给外部
  const setNum = (nextNum) => {
    if (value.current === nextNum) {
      return;
    }
    const output = nextNum === null ? null : createValue(nextNum);
    givenOnChange(output);
    value.current = nextNum;
  };

  const setCurr = (nextCursor) => {
    if (typeof nextCursor !== 'number') {
      return;
    }
    cursor.current = nextCursor;
  };

  // 修改光标位置，注意，不是每次变更都要调用，而是仅在需要移动光标时调用
  // 每次变更时，直接 setCurr(nextCursor) 即可
  const moveCursorTo = (nextCursor) => {
    setCurr(nextCursor);
    setLatestCursorChangedAt(Date.now());
  };

  // 通过layouteffect避免跳位
  useLayoutEffect(() => {
    if (!latestCursorChangedAt) {
      return;
    }
    setCursor(cursor.current);
  }, [latestCursorChangedAt]);

  // 外部主动更换了值，作为受控组件，去调整内部的状态
  useEffect(() => {
    if (givenValue === createValue(value.current)) {
      return;
    }

    const nextText = formatNumber(givenValue);
    setText(nextText);
    value.current = givenValue;
    moveCursorTo(nextText.length); // 光标定位到末尾
  }, [givenValue]);

  // 值发生变化时被调用
  const onTextChange = (nextText) => {
    if (nextText === '' || typeof nextText === 'undefined') {
      setText('');
      setNum(null);
      setCurr(0);
      return;
    }

    const nextCursor = getCursor();

    // 先处理limit限制
    if (limit) {
      const [intLimit, deciLimit] = limit.split('.');
      const nextNum = `${toNum(nextText)}`;
      const [integerPart, decimal = ''] = nextNum.split('.');
      if (intLimit) {
        const isNegative = integerPart[0] === '-';
        const integer = isNegative ? integerPart.substring(1) : integerPart;
        if (integer.length > +intLimit) {
          moveCursorTo(cursor.current);
          catchLimit?.({
            type: 'limit.integer',
            range: +intLimit,
            receive: integer.length,
          });
          return;
        }
      }
      if (deciLimit) {
        if (decimal.length > +deciLimit) {
          moveCursorTo(cursor.current);
          catchLimit?.({
            type: 'limit.decimal',
            range: +deciLimit,
            receive: decimal.length,
          });
          return;
        }
      }
    }

    // 最大值
    if (isNumber(max)) {
      const nextNum = toNum(nextText);
      // @ts-ignore
      if (Math.max(max, nextNum) !== max) {
        moveCursorTo(cursor.current);
        catchLimit?.({
          type: 'max',
          range: max,
          receive: nextNum,
        });
        return;
      }
    }

    // 最小值
    if (isNumber(min)) {
      const nextNum = toNum(nextText);
      // @ts-ignore
      if (Math.min(min, nextNum) !== min) {
        moveCursorTo(cursor.current);
        catchLimit?.({
          type: 'min',
          range: min,
          receive: nextNum,
        });
        return;
      }
    }

    // 先处理一些特殊情况
    if (nextText === '-') {
      setText('-');
      setCurr(1);
    } else if (nextText === '.') {
      setText('0.');
      setNum(0);
      setCurr(2);
    } else if (nextText === '-.') {
      setText('-0.');
      setNum(0);
      setCurr(3);
    } else if (nextText === '0.') {
      setText('0.');
      setNum(0);
      setCurr(2);
    }
    // 末尾增加了一个小数点
    else if (nextText === `${text}.`) {
      // 已经存在小数点了，就不做任何变更
      if (text.indexOf('.') > -1) {
        return;
      }
      setText(nextText);
      setCurr(nextCursor);
    }
    // 删除了末尾的小数点
    else if (text === `${nextText}.`) {
      setText(nextText);
      setCurr(nextCursor);
    }
    // 输入了小数点，表示要移动小数点位置到当前输入的位置，即使原来已经有小数点了，比如 123.45 -> 123.4.|5 -> 1234.5
    // 注意，必须放在下面两条规则前面
    else if (
      text.length + 1 === nextText.length &&
      nextText[nextCursor - 1] === '.' &&
      text.replace(/\./g, '') === nextText.replace(/\./g, '')
    ) {
      // 不允许两个.连在一起
      if (nextText.indexOf('..') > -1) {
        // 直接在小数点旁边又加了一个小数点
        // 把光标放在小数点后面
        moveCursorTo(text.indexOf('.') + 1);
      }
      // 移动小数点位置
      else {
        const before = nextText.substring(0, nextCursor).replace(/\./g, '');
        const after = nextText.substring(nextCursor).replace(/\./g, '');

        const str = `${before}.${after}`;
        // 在负号后面直接添加了一个小数点
        const s = str.indexOf('-.') === 0 ? str.replace('-.', '-0.') : str;
        const nextNum = toNum(s);
        const t = formatNumber(nextNum);

        setText(t);
        setNum(nextNum);
        // 把光标放在小数点后面
        moveCursorTo(t.indexOf('.') + 1);
      }
    }
    // 删除了小数点，由于删除小数点会导致小数部分直接变为整数部分，因此整个数值的变化比较大
    // 这里计算起来也比较复杂，因为整个数已经完全重新格式化了
    else if (
      text.length - 1 === nextText.length &&
      text.indexOf('.') > -1 &&
      nextText.indexOf('.') === -1 &&
      text.replace(/\./g, '') === nextText
    ) {
      const nextNum = toNum(nextText);
      const t = formatNumber(nextNum);
      setText(t);
      setNum(nextNum);

      const [before, after] = text.split('.'); // 删除小数点前的情况
      // 如果删除前的数字小数点后面的位数除3除不尽，那么新格式化后，必然会像前借位增加一个分隔符
      if (after.length % 3 !== 0) {
        // 会在小数点前新加一个分隔符之后光标往后移一位
        if (before.length % 3 === 0) {
          moveCursorTo(nextCursor + 1);
        }
        // 而如果原本小数点前面不足3位，则删除小数点时，前面永远不可能增加一个分隔符
        else {
          moveCursorTo(nextCursor);
        }
      }
      // 如果除尽，光标就没有发生变化
      else {
        moveCursorTo(nextCursor);
      }
    }
    // 操作小数点后面末尾的0，值没有任何变化，只是末尾的0在变化
    // 末尾为0不触发外部回调
    else if (
      nextText.indexOf('.') > 0 &&
      nextText[nextText.length - 1] === '0' &&
      (nextText === `${text}0` || `${nextText}0` === text)
    ) {
      setText(nextText);
      setCurr(nextCursor);
    }
    // 在末尾删除一位后留下小数点
    else if (nextText[nextText.length - 1] === '.' && text.indexOf(nextText) === 0) {
      setText(nextText);
      setCurr(nextCursor);
    }
    // 仅仅修改了小数部分的一个值
    else if (nextText.indexOf('.') > -1 && text.indexOf('.') > -1 && text.split('.')[0] === nextText.split('.')[0]) {
      const [, decimal] = nextText.split('.');
      // 小数部分仅能是数字
      // TODO 小数部分将来可能支持分隔符
      if (/^[0-9]+$/.test(decimal)) {
        setText(nextText);
        const nextNum = toNum(nextText);
        setNum(nextNum);
        setCurr(nextCursor);
      }
      // 在小数部分输入了非法字符
      else {
        moveCursorTo(cursor.current);
      }
    }
    // 添加了一个逗号，直接不处理
    else if (
      text.length + 1 === nextText.length &&
      text.split(separator).length === nextText.split(separator).length - 1 &&
      toNum(text) === toNum(nextText)
    ) {
      moveCursorTo(nextCursor - 1);
    }
    // 删掉了一个逗号，实际是删掉逗号前面一位数字
    else if (
      text.length - 1 === nextText.length &&
      text.split(separator).length === nextText.split(separator).length + 1 &&
      toNum(text) === toNum(nextText)
    ) {
      const changeAt = nextCursor - 1;
      const chars = text.split('');
      chars.splice(changeAt, 1);
      const str = chars.join('');
      const nextNum = toNum(str);
      const t = formatNumber(nextNum);

      setText(t);
      setNum(nextNum);

      // 根据逗号是否减少来决定光标的位置
      // 逗号减少了
      if (countSep(text) > countSep(t)) {
        moveCursorTo(changeAt - 1);
      } else {
        moveCursorTo(changeAt);
      }
    }
    // 删除了小数点前面的整数部分
    else if (nextText[0] === '.' && text.indexOf('.') > 0) {
      const newText = `0${nextText}`;
      const nextNum = toNum(newText);
      setText(newText);
      setNum(nextNum);
      moveCursorTo(1);
    }
    // 正常修改、输入数值
    else {
      const nextNum = toNum(nextText);
      // 输入了非数字，直接不发生任何变化
      if (!isNumber(nextNum) && !isNumeric(nextNum)) {
        moveCursorTo(cursor.current);
      }
      // 输入了新值
      else {
        const t = formatNumber(nextNum);
        setText(t);
        setNum(nextNum);

        // 删到顶了
        if (nextCursor === 0) {
          moveCursorTo(0);
        }
        // 根据逗号是否减少来决定光标的位置
        // 逗号减少了
        else if (countSep(text) > countSep(t)) {
          moveCursorTo(nextCursor - 1);
        }
        // 逗号增加了
        else if (countSep(text) < countSep(t)) {
          moveCursorTo(nextCursor + 1);
        }
        // 逗号不变
        else {
          moveCursorTo(nextCursor);
        }
      }
    }
  };

  const onCursorChange = () => {
    cursor.current = getCursor();
  };

  // @ts-ignore
  return {
    ...options,
    value: givenValue,
    onTextChange,
    onCursorChange,
    numeric: text,
  };
}
