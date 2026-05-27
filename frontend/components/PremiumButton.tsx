'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface PremiumButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

const PremiumButton: React.FC<PremiumButtonProps> = ({ onClick, children, className = '' }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`relative overflow-hidden px-6 py-3 rounded-md font-mono text-sm font-bold tracking-widest text-black bg-accent-green shadow-[0_0_20px_rgba(0,255,157,0.4)] hover:shadow-[0_0_30px_rgba(0,255,157,0.6)] transition-shadow group ${className}`}
    >
      <span className="relative z-10">{children}</span>
      {/* Sweeping shine effect */}
      <motion.div
        className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg]"
        initial={{ x: '-150%' }}
        animate={{ x: '150%' }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
          repeatDelay: 1,
        }}
      />
    </motion.button>
  );
};

export default PremiumButton;
