import { motion } from 'framer-motion'

export default function StatCard({ title, value, icon, delay }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-[#1e293b]/40 border border-white/5 backdrop-blur-xl p-8 rounded-3xl flex items-center gap-6"
        >
            <div className="p-4 bg-white/5 rounded-2xl">
                {icon}
            </div>
            <div>
                <p className="text-gray-400 font-medium text-sm">{title}</p>
                <p className="text-3xl font-black mt-1">{value}</p>
            </div>
        </motion.div>
    )
}
